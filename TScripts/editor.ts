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
  mutationObserver?: MutationObserver;
  selection: Selection | null = null;
  location?: EditorLocation;

  editing = false;
  isPopoverOpen: boolean = false;

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

    // XXX: for now we don't check if the content is empty or not
    this.content?.setAttribute("data-mentiontextareaempty", "");
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

    listener("keyup", (_) => (this.location = this.getCaretLocation()));
    listener("focus", (_) => (this.location = this.getCaretLocation()));
    listener("click", (_) => (this.location = this.getCaretLocation()));

    listener("paste", async (ev) => {
      const text = ev.clipboardData?.getData("text");

      const selection = window.getSelection();
      if (!selection?.rangeCount) return false;
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text!));
      selection.collapseToEnd();

      ev.preventDefault();
      await this.updateEditorContent();
    });

    listener("keydown", async (event) => {
      const ev = event as KeyboardEvent;
      if (this.isContentEmpty() && ev.key === "Backspace") {
        // to keep the editor with at least one line we must disable backspace when the
        // content is empty
        ev.preventDefault();
        return;
      }

      // these keybings will be handled in C#
      if (this.isPopoverOpen) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowDown":
          case "Enter":
          case "Escape":
            ev.preventDefault();
            break;
        }
      }
    });
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

  getLineAt(row: number) {
    const children = this.content!.children;
    if (row > children.length) {
      // row = 0;
      throw new Error("row is out of content range");
    }
    return children[row];
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

  getCaretLocation(): EditorLocation {
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

    let word: HTMLElement | null = null;
    let offset = col;

    // find the word and the offset inside in line based on the col
    for (let child of line.children) {
      const len = (child as HTMLElement).innerText.length;
      offset -= len;
      if (offset <= 0) {
        word = child as HTMLElement;
        offset = len + offset;
        break;
      }
    }

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

        this.location = this.getCaretLocation();
        const { word } = this.location!;
        if (word?.hasAttribute("data-mention")) {
          const rect = word?.getBoundingClientRect();

          await this.dotnetReference.invokeMethodAsync(
            "OnMention",
            (word as HTMLElement).innerText,
            rect!.top,
            rect!.left
          );
        }
      }
    } finally {
      if (this.isContentEmpty()) {
        this.content?.setAttribute("data-mentiontextareaempty", "");
      } else {
        this.content?.removeAttribute("data-mentiontextareaempty");
      }
      this.editing = false;
    }
  }

  createTextNodeFromToken(token: Token) {
    const el = document.createElement("span");
    el.innerText = token.value;
    for (let attr in token.attributes) {
      el.setAttribute(attr, token.attributes[attr]);
      if (attr === "data-mention") {
        el.addEventListener("mouseenter", async (ev) => {
          const word = ev.target as HTMLElement;
          const rect = word.getBoundingClientRect();

          await this.dotnetReference.invokeMethodAsync("MentionTooltipOpen", {
            marker: word.getAttribute("data-mention"),
            query: word.innerText.substring(1), // skip the marker
            top: rect.top,
            left: rect.left,
          });
        });

        el.addEventListener("mouseleave", async (ev) => {
          await this.dotnetReference.invokeMethodAsync("MentionTooltipClose");
        });
      }
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
    const { word } = this.location!;
    if (word) {
      const marker = word.getAttribute("data-mention");
      (word as HTMLElement).innerText = marker + username + " ";

      const selection = window.getSelection();
      if (selection) {
        const range = new Range();
        range.setEndAfter(word);
        range.collapse();

        selection.removeAllRanges();
        selection.addRange(range);

        await this.updateEditorContent();
      }
    }
  }

  async isPopoverVisible(status: boolean) {
    this.isPopoverOpen = status;
  }
}

export const editor = new Editor();
