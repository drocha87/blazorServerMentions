declare global {
  interface Window {
    mudpopoverHelper: any;
  }
}

// this enum is defined in MentionTextare.razor.cs
enum TokenType {
  Mention = 0,
  Text = 1,
}

interface Token {
  type: TokenType;
  value: string;
}

interface EditorLocation {
  row: number;
  col: number;
  line?: Element;
  word?: Element;
}

export class EditorContext {
  location?: EditorLocation;

  subscribers: Function[] = [];

  constructor(public editor: Editor) {}

  update() {
    this.location = this.editor.getEditorCaretLocation();
    if (this.location?.line) {
      if (!this.editor.updatingEditorContent) {
        for (let subscriber of this.subscribers) {
          subscriber(this);
        }
      }
    }
  }

  onChange(callback: Function) {
    this.subscribers.push(callback);
  }

  isMention() {
    return this.location?.word?.hasAttribute("data-mention");
  }
}

export class Editor {
  dotnetReference: any = null;

  content?: HTMLDivElement;
  popover: HTMLElement | null = null;
  mutationObserver?: MutationObserver;
  selection: Selection | null = null;
  highlightedMention?: Element;
  context?: EditorContext;

  shouldRender = false;
  updatingEditorContent = false;

  constructor() {
    if (typeof window.getSelection === "undefined") {
      // we depend on window.getSelection existing
      throw new Error(
        "your browser do not support window.getSelection! The editor will not work properly"
      );
    }
  }

  // this method will be called when the component is disposed (called in C#)
  dispose() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  }

  initialize(reference: any) {
    this.dotnetReference = reference;

    this.content = document.getElementsByClassName(
      "editor"
    )[0] as HTMLDivElement;
    this.context = new EditorContext(this);

    // start the editor with an empty line
    this.appendNewLineEditor();
    this.initializeMutationObserver();
    this.initializeMentionPopover();

    // XXX: if we don't filter this event we'll send at least two input events with the same data
    // this is breaking the flow and the layout of the editor
    this.content.addEventListener("compositionend", async (ev) => {
      await this.emitEditorUpdate();
    });

    this.content.addEventListener("input", async (ev) => {
      if (!(ev as KeyboardEvent).isComposing) {
        await this.emitEditorUpdate();
      }
    });

    this.context.onChange(
      async (ctx: EditorContext) => await this.updateInterface(ctx)
    );

    // this is how we update the interface. We look if the selectionchange and only if
    // it happened inside our component we dispatch a updateInterface().
    document.addEventListener("selectionchange", async (ev) => {
      this.shouldRender = true;
      if ((ev.target as Document).activeElement === this.content) {
        this.selection = document.getSelection();
        this.context?.update();
        // await this.updateInterface();
      }
    });

    this.content.addEventListener("keyup", (ev) => {
      this.shouldRender = true;
    });

    this.content.addEventListener("keydown", (event) => {
      const ev = event as KeyboardEvent;
      this.shouldRender = false;

      if (this.isContentEmpty()) {
        // to keep the editor with at least one line we must disable backspace when the
        // content is empty
        if (ev.key === "Backspace") {
          ev.preventDefault();
          return;
        }
      }

      // this.updateInterface();
      // these keybings will be handled in C#
      if (this.isMentionPopoverOpen) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowDown":
          case "Enter":
          case "Escape":
            ev.preventDefault();
            break;
        }
      } else {
        switch (ev.key) {
          case "Enter":
            // opening a new line, we should ensure the structure of <div line><span word><br></span></div>
            break;

          default:
            break;
        }
      }
    });

    this.content.addEventListener("blur", (ev) => {
      this.shouldRender = true;
      this.clearHighlightedWord();
    });

    this.content.addEventListener("click", async (ev) => {
      this.shouldRender = true;
      this.context?.update();
    });

    this.content.addEventListener("focus", async (ev) => {
      this.shouldRender = true;
      this.context?.update();
    });
  }

  initializeMutationObserver() {
    const config = {
      attributes: true,
      attributeFilter: ["data-highlightword", "data-highlightline"],
      childList: true,
      characterData: false,
      subtree: true,
    };

    this.mutationObserver = new MutationObserver((mutationList, observer) => {
      for (const mutation of mutationList) {
        if (mutation.type === "childList") {
          if (mutation.addedNodes.length > 0) {
            const node = mutation.addedNodes[0];
            if (node instanceof HTMLElement) {
              const el = node as HTMLElement;
              if (el.hasAttribute("data-line")) {
                // console.log("added: ", el);
              }
            }
          }

          if (mutation.removedNodes.length > 0) {
            const node = mutation.removedNodes[0];
            if (node instanceof HTMLElement) {
              const el = node as HTMLElement;
              if (el.hasAttribute("data-line")) {
                // console.log("removed: ", el);
              }
            }
          }
        }

        if (mutation.type === "attributes") {
          switch (mutation.attributeName) {
            case "data-highlightword":
            case "data-highlightline":
              break;

            default:
              break;
          }
        }
      }
    });
    this.mutationObserver.observe(this.content as Node, config);
  }

  async updateInterface(ctx: EditorContext) {
    this.clearHighlightedWord();
    this.clearHighlightedLine();

    const { row, col, word, line } = ctx.location!;

    if (this.isContentEmpty()) {
      await this.dotnetReference.invokeMethodAsync("OnUpdateStats", 1, 1);
      return;
    }
    this.highlightCurrentLine(ctx);

    let workingWord = word;
    if (!workingWord) {
      if (col > 0) {
        // the caret is in the last line position
        workingWord = this.getWordAt(row, col - 1);
        if (!workingWord || this.isSpace(workingWord as HTMLElement)) {
          return;
        }
      }
    }

    if (workingWord?.hasAttribute("data-mention")) {
      this.highlightedMention = workingWord;

      await this.dotnetReference.invokeMethodAsync(
        "OnMention",
        (workingWord as HTMLElement).innerText
      );
    } else {
      if (this.isMentionPopoverOpen) {
        await this.dotnetReference.invokeMethodAsync("OnCloseMentionPopover");
      }
      this.highlightWordUnderCaret(workingWord as HTMLElement);
    }

    await this.dotnetReference.invokeMethodAsync(
      "OnUpdateStats",
      row + 1,
      col + 1
    );
  }

  clearHighlightedWord() {
    const word = this.content?.querySelector("[data-currentword]");
    word?.removeAttribute("data-currentword");
  }

  clearHighlightedLine() {
    const hl = this.content?.querySelector("[data-currentline]");
    hl?.removeAttribute("data-currentline");
  }

  highlightCurrentLine(context: EditorContext) {
    if (context.location) {
      context.location.line?.setAttribute("data-currentline", "");
    }
  }

  highlightWordUnderCaret(word: HTMLElement) {
    if (this.isSpace(word)) {
      const previous = word.previousElementSibling as HTMLElement;
      if (!previous || this.isSpace(previous)) {
        return;
      }
      word = previous;
    }
    word?.setAttribute("data-currentword", "");
  }

  isLineEmpty(line: Element) {
    if (line) {
      const words = line.querySelectorAll(`[data-word]`);
      // the word has two possible values:
      // 1: a text
      // 2: a <br>
      // in case of a text `firstElementChild` IS NULL so we know that the
      // line is not empty
      return words.length <= 0 || words[0].firstElementChild !== null;
    }
    return true;
  }

  isContentEmpty() {
    const lines = this.content?.querySelectorAll(`[data-line]`) ?? [];
    if (lines.length > 1) {
      return false;
    }
    return this.isLineEmpty(lines[0]);
  }

  nodeToElement(node: Node | null): Element | null {
    if (node instanceof Element) {
      return node;
    }
    return node && this.nodeToElement(node.parentNode);
  }

  nodeToLine(node: Node | null): Element | null {
    let el = this.nodeToElement(node);
    if (el) {
      if (el.hasAttribute("data-line")) {
        return el;
      }
      if (el.hasAttribute("data-word")) {
        return this.nodeToLine(el.parentElement);
      }
    }
    return null;
  }

  appendNewLineEditor() {
    const line = document.createElement("div");
    const br = document.createElement("br");
    line.appendChild(br);
    line.setAttribute("data-line", "");
    line.classList.add("line");
    this.content?.appendChild(line);
    return line;
  }

  getLineAt(row: number) {
    const children = this.content!.children;
    if (row > children.length) {
      row = 0;
    }
    return children[row];
  }

  // This text editor has a line which is defined as following:
  //     <div data-line> ...<span data-word></span> </div>
  // But the column is an index as if the line was composed only by text.
  // So this helper function will calculate the `index` which is the index in the
  // line children and an `offset` the character position in the child (element at index)
  getWordIndexAndOffset(line: Element, col: number) {
    let index = 0;
    let offset = col;

    for (let word of line.querySelectorAll("[data-word]")) {
      index = parseInt(word.getAttribute("data-wordindex")!, 10);
      const start = parseInt(word.getAttribute("data-wordstart")!, 10);
      const end = parseInt(word.getAttribute("data-wordend")!, 10);
      if (col >= start && col <= end) {
        break;
      }
      offset = col - end;
    }
    return { index, offset };
  }

  isSpace(word: HTMLElement) {
    if (word?.hasAttribute("data-word")) {
      return /\s/g.test(word?.innerText);
    }
    return false;
  }

  getWordAt(row: number, col: number) {
    const line = this.getLineAt(row);
    for (let word of line.querySelectorAll("[data-word]")) {
      const start = parseInt(word.getAttribute("data-wordstart")!, 10);
      const end = parseInt(word.getAttribute("data-wordend")!, 10);
      if (col >= start && col < end) {
        return word;
      }
    }
  }

  getCaretOffsetInLine(line: Element, sel: Selection) {
    const range = sel.getRangeAt(0);
    const clone = range.cloneRange();
    // basically select the entire line
    clone.selectNodeContents(line);
    // then reduce the selection to the mark at end
    clone.setEnd(range.endContainer, range.endOffset);
    // now counting the length of the selected string will result in the caret position
    return clone.toString().length;
  }

  getEditorCaretLocation(): EditorLocation {
    if (this.selection) {
      const sel = this.selection;
      const node = sel.anchorNode;
      const line = this.nodeToLine(node);

      if (line && sel.isCollapsed) {
        const row = Array.prototype.indexOf.call(this.content!.children, line);
        const col = this.getCaretOffsetInLine(line, sel);
        const word = this.getWordAt(row, col);

        if (row >= 0) {
          return {
            row,
            col,
            line,
            word,
          };
        }
      }
    }
    return { row: 0, col: 0 };
  }

  setCaretInLine(line: Element, col: number) {
    const selection = window.getSelection();
    const range = new Range();

    const { index, offset } = this.getWordIndexAndOffset(line, col);
    const word = line.children[index];

    if (!word?.firstChild) {
      throw new Error("setCaretInLine: cannot set line in null element");
    }

    range.setStart(word.firstChild, offset);
    range.collapse(true);

    // FIXME: selection can be null
    selection!.removeAllRanges();
    selection!.addRange(range);
  }

  getContent() {
    if (!this.isContentEmpty()) {
      return (this.content as HTMLDivElement).innerText;
    }
  }

  async emitEditorUpdate() {
    try {
      this.updatingEditorContent = true;
      let line = null;
      if (this.isContentEmpty()) {
        line = this.content?.firstElementChild;

        if (line?.childElementCount && line.childElementCount > 0) {
          const content = (line as HTMLElement).innerText;
          const span = document.createElement("span");
          span.setAttribute("data-word", "");
          span.innerText = content;

          line.replaceChild(span, line.firstChild!);
        }
      } else {
        line = this.nodeToLine(this.selection!.anchorNode);
        if (line && this.isLineEmpty(line)) {
          // FIXME: if line is empty and the last word in previous line is a mention
          // for some reason the new node create here will contain a data attribute `mention`
          // so we must clean it to close the popover.
          line?.firstElementChild?.removeAttribute("data-mention");
        }
      }

      if (line) {
        const offset = this.getCaretOffsetInLine(line, this.selection!);
        const content = (line as HTMLElement).innerText;

        if (content?.length > 0 && content !== "\n") {
          const tokens = await this.dotnetReference.invokeMethodAsync(
            "ParseLine",
            content
          );
          line = this.updateLine(line, tokens);
          this.setCaretInLine(line, offset);
        }
      }
    } catch (e) {
      // TODO: handle exception here
      throw e;
    } finally {
      this.updatingEditorContent = false;
    }
  }

  createTextNodeFromToken(
    token: Token,
    location: { index: number; start: number; end: number }
  ) {
    const el = document.createElement("span");
    el.innerText = token.value;
    el.setAttribute("data-word", "");
    el.setAttribute("data-wordindex", location.index.toString());
    el.setAttribute("data-wordstart", location.start.toString());
    el.setAttribute("data-wordend", location.end.toString());

    switch (token.type) {
      case TokenType.Mention: {
        el.setAttribute("data-mention", "");
        break;
      }
      default:
        break;
    }
    return el;
  }

  updateLine(line: Element, tokens: Token[]) {
    if (this.isLineEmpty(line)) {
      let newLine = document.createElement("div");
      newLine.setAttribute("data-line", "");
      this.content!.replaceChild(newLine, line);
      line = newLine;
    }

    const wordsInLine = line.children.length;
    let start = 0;

    for (let [index, token] of tokens.entries()) {
      const node = line.children[index];
      const len = token.value.length;

      const el = this.createTextNodeFromToken(token, {
        index,
        start,
        end: start + len,
      });
      start += len;

      if (node === undefined) {
        line.appendChild(el);
        continue;
      }

      if (!node.isEqualNode(el)) {
        line.replaceChild(el, node);
        continue;
      }
    }

    if (tokens.length < wordsInLine) {
      for (let node of [...line.children].slice(tokens.length)) {
        node.remove();
      }
    }

    return line;
  }

  clearEditor() {
    while (this.content?.firstChild) {
      this.content.removeChild(this.content.firstChild);
    }
  }

  async insertMentionAtHighlighted(username: string) {
    if (this.highlightedMention) {
      (this.highlightedMention as HTMLElement).innerText = "@" + username;

      const selection = window.getSelection();

      const range = new Range();
      range.setEndAfter(this.highlightedMention);
      range.collapse();

      selection!.removeAllRanges();
      selection!.addRange(range);

      await this.emitEditorUpdate();
    }
  }

  get isMentionPopoverOpen() {
    return this.popover?.classList.contains("mud-popover-open") ?? false;
  }

  initializeMentionPopover() {
    // get the popover content, so we can positionate it according to the mention
    let popoverElement = document.getElementById(
      "editor-popover-container"
    )?.firstElementChild;

    if (!popoverElement) {
      throw new Error("popoverElement is not in the DOM");
    }

    // strip the first 8 "popover-" string because the popover content use the same guid defined after it
    let popoverId = popoverElement.id.substring(8);
    this.popover = document.getElementById(`popovercontent-${popoverId}`);

    if (this.popover) {
      (window as any).mudPopover.disconnect(popoverId);

      const config: MutationObserverInit = {
        attributes: true,
      };

      const mutationObserver = new MutationObserver(
        async (mutationList, observe) => {
          if (editor.highlightedMention) {
            for (const mutation of mutationList) {
              if (mutation.type === "attributes") {
                const el = mutation.target as HTMLElement;
                if (el.classList.contains("mud-popover-open")) {
                  const selfRect = this.popover!.getBoundingClientRect();
                  this.placePopover(selfRect.height);
                }
              }
            }
          }
        }
      );
      mutationObserver.observe(this.popover, config);

      const resizeObserver = new ResizeObserver(async (entries) => {
        const entry = entries[0];
        if (editor.highlightedMention) {
          this.placePopover(entry.contentRect.height);
        }
      });
      resizeObserver.observe(this.popover);
    }
  }

  placePopover(height: number) {
    if (this.popover) {
      const rect = this.highlightedMention!.getBoundingClientRect();
      this.popover.style.top = `${rect.top - height - 2}px`;
      this.popover.style.left = `${rect.left}px`;
    }
  }
}

export const editor = new Editor();
