interface Token {
  value: string;
  attributes: { [key: string]: string };
}

interface EditorLocation {
  row: number;
  col: number;
  line?: Element;
  word?: Element;
}

export class Editor {
  dotnetReference: any = null;

  content?: HTMLDivElement;
  popover: HTMLElement | null = null;
  mutationObserver?: MutationObserver;
  selection: Selection | null = null;
  highlightedMention?: Element;
  location?: EditorLocation;

  editing = false;

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

    // start the editor with an empty line
    this.appendNewLineEditor();
    this.initializeMentionPopover();

    const listener = this.content.addEventListener;

    // XXX: if we don't filter this event we'll send at least two input events with the same data
    // this is breaking the flow and the layout of the editor
    this.content.addEventListener(
      "compositionend",
      async (ev) => await this.updateEditorContent()
    );

    this.content.addEventListener("input", async (ev) => {
      if (!(ev as KeyboardEvent).isComposing) {
        await this.updateEditorContent();
      }
    });

    listener("keyup", async (_) => await this.update());
    listener("focus", async (_) => await this.update());
    listener("click", async (_) => await this.update());

    listener("keydown", async (event) => {
      const ev = event as KeyboardEvent;

      if (this.isContentEmpty()) {
        // to keep the editor with at least one line we must disable backspace when the
        // content is empty
        if (ev.key === "Backspace") {
          ev.preventDefault();
          return;
        }
      }

      // these keybings will be handled in C#
      if (this.popover?.classList.contains("mud-popover-open")) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowDown":
          case "Enter":
          case "Escape":
            ev.preventDefault();
            break;

          case " ":
            await this.dotnetReference.invokeMethodAsync(
              "OnCloseMentionPopover"
            );
            break;
        }
      }
    });
  }

  async update() {
    this.location = this.getEditorCaretLocation();
    if (this.location?.line && !this.editing) {
      await this.updateInterface();
    }
  }

  async updateEditorContent() {
    const selection = window.getSelection();
    if (selection?.anchorNode) {
      const line = this.nodeToLine(selection.anchorNode);
      if (line) {
        const offset = this.getCaretOffsetInLine(line, selection);
        await this.emitEditorUpdate(line, offset);
      }
    }
  }

  async updateInterface() {
    const { word } = this.location!;
    if (word?.hasAttribute("data-mention")) {
      this.highlightedMention = word;
      await this.dotnetReference.invokeMethodAsync(
        "OnMention",
        (word as HTMLElement).innerText
      );
    }
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
    if (node instanceof Element || node === null) {
      return node;
    }
    return this.nodeToElement(node?.parentNode);
  }

  nodeToLine(node: Node | null): Element | null {
    let el = this.nodeToElement(node);
    if (el?.hasAttribute("data-line")) {
      return el;
    }
    if (el?.hasAttribute("data-word")) {
      return this.nodeToLine(el.parentElement);
    }
    return null;
  }

  appendNewLineEditor() {
    const line = document.createElement("div");
    const br = document.createElement("br");
    line.appendChild(br);
    line.setAttribute("data-line", "");
    this.content?.appendChild(line);
    return line;
  }

  getLineAt(row: number) {
    const children = this.content!.children;
    if (row > children.length) {
      // row = 0;
      throw new Error("row is out of content range");
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

  getWordAt(row: number, col: number) {
    const line = this.getLineAt(row);
    for (let word of line.querySelectorAll("[data-word]")) {
      const start = parseInt(word.getAttribute("data-wordstart")!, 10);
      const end = parseInt(word.getAttribute("data-wordend")!, 10);
      // XXX: sometimes we must return it when col is just < end
      if (col >= start && col <= end) {
        return word;
      }
    }

    // if the caret is in the end of the line so try to return the previous word
    // if ((line as HTMLElement).innerText?.length === col) {
    //   return line.lastElementChild ?? undefined;
    // }
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
    const selection = window.getSelection();
    if (selection && this.content) {
      const node = selection.anchorNode;
      const line = this.nodeToLine(node);

      if (line && selection.isCollapsed) {
        const row = Array.prototype.indexOf.call(this.content.children, line);

        const col = this.getCaretOffsetInLine(line, selection);
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
      throw new Error("setCaretInLine: cannot set caret in null element");
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
    return "";
  }

  async emitEditorUpdate(line: Element, offset: number) {
    try {
      if (!this.editing) {
        this.editing = true;
        const content = (line as HTMLElement).innerText;
        const tokens = await this.dotnetReference.invokeMethodAsync(
          "Tokenizer",
          content
        );
        const newLine = this.newLineFromTokens(tokens);

        if (line) {
          this.content?.replaceChild(newLine, line);
        } else {
          this.content?.appendChild(newLine);
        }
        this.setCaretInLine(newLine, offset);
      }
    } finally {
      this.editing = false;
    }
  }

  createTextNodeFromToken(token: Token) {
    const el = document.createElement("span");
    el.innerText = token.value;
    for (let attr in token.attributes) {
      el.setAttribute(attr, token.attributes[attr]);
    }
    return el;
  }

  newLineFromTokens(tokens: Token[]) {
    const line = document.createElement("div");
    line.setAttribute("data-line", "");
    for (let token of tokens) {
      const el = this.createTextNodeFromToken(token);
      line.appendChild(el);
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
      const marker = this.highlightedMention.getAttribute("data-mention");
      (this.highlightedMention as HTMLElement).innerText = marker + username;

      const selection = window.getSelection();

      const range = new Range();
      range.setEndAfter(this.highlightedMention);
      range.collapse();

      selection!.removeAllRanges();
      selection!.addRange(range);

      await this.updateEditorContent();
    }
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
