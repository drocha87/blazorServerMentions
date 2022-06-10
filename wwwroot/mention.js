// this enum is defined in MentionTextare.razor.cs
const TokenType = {
  Mention: 0,
  Text: 1,
};

class Editor {
  dotnetReference = null;
  content = null;
  popoverContent = null;
  editorCurrentLine = null;
  highlightedMention = null;

  // save the last highlight avoid us to traverse the entire editor nodes
  // checking and removing the `highlight` class
  lastHighlightedWord = null;
  lastHighlightedLine = null;

  currentCaretLocation = {row: 1, col: 1, isCollapsed: false};

  constructor() {
    if (typeof window.getSelection === "undefined") {
      // we depend on window.getSelection existing
      throw new Error(
        "your browser do not support window.getSelection! The editor will not work properly"
      );
    }
  }

  initialize(reference) {
    this.dotnetReference = reference;

    this.content = document.getElementsByClassName("editor")[0];

    this.initializeMentionPopover();

    // XXX: if we don't filter this event we'll send at least two input events with the same data
    // this is breaking the flow and the layout of the editor
    this.content.addEventListener("compositionend", async (ev) => {
      await this.emitEditorUpdate(ev);
    });

    this.content.addEventListener("input", async (ev) => {
      if (!ev.isComposing) {
        await this.emitEditorUpdate(ev);
      }
    });

    this.content.addEventListener("keyup", (ev) => {
      // if (ev.key.length > 1) {
      // as we highlight the word right after the input event, we should not trigger it here again.
      // so to avoid it (not 100%) but effectively we dispatch `highlightWordUnderCaret` only when
      // the key was supposed to not generate an input event
      this.updateInterface();
      // }
    });

    this.content.addEventListener("keydown", (ev) => {
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
      }
    });

    this.content.addEventListener("click", (ev) => {
      this.updateInterface();
    });
  }

  updateInterface() {
    this.currentCaretLocation = this.getEditorCaretLocation();

    this.highlightCurrentLine();
    this.highlightWordUnderCaret();
  }

  anchorNodeToElement(node) {
    if (node instanceof Element) {
      return node;
    }
    return node && this.anchorNodeToElement(node.parentNode);
  }

  anchorNodeToLine(node) {
    let line = this.anchorNodeToElement(node);
    if (line.hasAttribute("data-line")) {
      return line;
    }
    if (line.hasAttribute("data-editor")) {
      // FIXME: if we backspace in an empty line this state is reachable
      // this line do not exist in editor
      throw new Error("line do not exists in editor");
    }
    return this.anchorNodeToLine(line.parentElement);
  }

  appendNewLineEditor() {
    const line = document.createElement("div");
    const br = document.createElement("br");

    line.appendChild(br);
    line.setAttribute("data-line", true);
    line.classList.add("line");

    this.content.appendChild(line);

    return line;
  }

  getLineAt(row) {
    //filter only valid lines
    const lines = [...this.content.children].filter((n) =>
      n.hasAttribute("data-line")
    );
    if (lines.length === 0) {
      // the editor has no lines, so we should create one empty line and return it
      return this.appendNewLineEditor();
    }
    return lines[row - 1];
  }

  getWordIndexAndOffset(line, offset) {
    let index = 0;
    // XXX: we are indexing both line and col starting with 1 but here we must index it based on 0
    offset -= 1;
    for (let word of line.children) {
      const len = word.innerText.length;
      if (len >= offset) {
        break;
      }
      index += 1;
      offset -= len;
    }

    return { index, offset };
  }

  getWordInLine(line, col) {
    const { index } = this.getWordIndexAndOffset(line, col);
    return [...line.children][index];
  }

  getWordAt(row, col) {
    const line = this.getLineAt(row);
    return this.getWordInLine(line, col);
  }

  getEditorCaretLocation() {
    const selection = window.getSelection();
    let line = selection.anchorNode;

    let row = 1;
    let col = 1;

    if (line !== this.content) {
      line = this.anchorNodeToLine(line);
      row = Array.prototype.indexOf.call(this.content.children, line) + 1;

      const range = selection.getRangeAt(0);
      const clone = range.cloneRange();

      // basically select the entire line
      clone.selectNodeContents(line);
      // then reduce the selection to the mark at end
      clone.setEnd(range.endContainer, range.endOffset);
      // now counting the length of the selected string will result in the caret position
      // we increment it by 1 because we are indexing lines and columns by one
      col = clone.toString().length + 1;
    }

    return { row, col, isCollapsed: selection.isCollapsed };
  }

  setEditorCaretLocation(row, col) {
    const range = new Range();
    const selection = window.getSelection();

    const line = this.getLineAt(row);
    const { offset } = this.getWordIndexAndOffset(line, col);
    const word = this.getWordAt(row, col);

    range.setStart(word.firstChild, offset);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  async emitEditorUpdate() {
    this.currentCaretLocation = this.getEditorCaretLocation();

    const { row, col, isCollapsed } = this.currentCaretLocation;

    // do not try to update editor if caret is a selection
    if (isCollapsed) {
      const line = this.getLineAt(row);
      if (line) {
        const content = line.innerText;
        if (content?.length > 0 && content !== "\n") {
          await this.dotnetReference.invokeMethodAsync("UpdateEditorContent", {
            content,
            row,
            col,
          });
        }
      }
    }
  }

  clearEditor() {
    while (this.content.firstChild) {
      this.content.removeChild(this.content.firstChild);
    }
  }

  get isMentionPopoverOpen() {
    return this.popoverContent.classList.contains("mud-popover-open");
  }

  insertMentionAtHighlighted(username) {
    if (this.highlightedMention) {
      this.highlightedMention.innerText = "@" + username;

      const selection = window.getSelection();

      const range = new Range();
      range.setEndAfter(this.highlightedMention);
      range.collapse();

      selection.removeAllRanges();
      selection.addRange(range);

      this.emitEditorUpdate();
    }
  }

  highlightCurrentLine() {
    // const { row } = this.getEditorCaretLocation();
    // const line = this.getLineAt(row);
    // if (line !== this.lastHighlightedLine) {
    //   if (this.lastHighlightedLine) {
    //     this.lastHighlightedLine.style.backgroundColor = "white";
    //   }
    //   line.style.backgroundColor = "red";
    //   this.lastHighlightedLine = line;
    // }
  }

  highlightWordUnderCaret() {
    const { row, col, isCollapsed } = this.currentCaretLocation;

    // do not try to highlight word is selection is not collapsed
    if (isCollapsed) {
      if (this.lastHighlightedWord) {
        this.lastHighlightedWord.classList.remove("highlight");
      }

      const word = this.getWordAt(row, col);
      if (word.hasAttribute("data-mention")) {
        this.dotnetReference.invokeMethodAsync("OnMention", word.innerText);
        this.highlightedMention = word;
        return;
      }

      if (this.isMentionPopoverOpen) {
        this.dotnetReference.invokeMethodAsync("OnCloseMentionPopover");
      }

      if (
        word?.hasAttribute("data-word") &&
        !word.classList.contains("highlight")
      ) {
        this.lastHighlightedWord = word;
        word.classList.add("highlight");
      }
    }
  }

  updateEditor(tokens, row, col) {
    let line = document.createElement("div");
    line.setAttribute("data-line", true);

    for (let token of tokens) {
      const el = document.createElement("span");
      el.innerText = token.value;

      switch (token.type) {
        case TokenType.Mention: {
          el.setAttribute("data-mention", true);
          el.classList.add("mention");

          el.addEventListener("mouseenter", (ev) => {
            const rect = el.getBoundingClientRect();
            this.dotnetReference.invokeMethodAsync("PopoverMentionInfo", {
              username: token.value,
              top: rect.top,
              left: rect.left,
            });
          });
          break;
        }

        default:
          el.setAttribute("data-word", true);
          break;
      }
      line.appendChild(el);
    }

    let oldLine = this.getLineAt(row);
    this.content.replaceChild(line, oldLine);
    this.setEditorCaretLocation(row, col);
    this.highlightWordUnderCaret();
    // highlightCurrentLine(editor);
  }

  initializeMentionPopover() {
    // get the popover content, so we can positionate if according to the mention
    let popoverElement = document.getElementById(
      "editor-popover-container"
    )?.firstElementChild;

    if (!popoverElement) {
      throw new Error("popoverElement is not in the DOM");
    }

    // strip the first 8 "popover-" string because the popover content use the same guid defined after it
    let popoverId = popoverElement.id.substring(8);
    this.popoverContent = document.getElementById(
      `popovercontent-${popoverId}`
    );

    // FIXME: **remove it** hack to fix popover position
    const originalPlacePopover = window.mudpopoverHelper.placePopover;
    window.mudpopoverHelper.placePopover = function (
      popoverNode,
      classSelector
    ) {
      if (popoverNode) {
        const id = popoverNode.id.substring(8);
        if (id === popoverId) {
          window.mentionEditor.placePopover();
          return;
        }
        originalPlacePopover(popoverNode, classSelector);
      }
    };
  }

  placePopover() {
    if (this.isMentionPopoverOpen) {
      const rect = this.highlightedMention.getBoundingClientRect();
      const selfRect = this.popoverContent.getBoundingClientRect();

      // use the native mudPopover to calculate the position
      const { top, left, offsetX, offsetY } =
        window.mudpopoverHelper.calculatePopoverPosition(
          Array.from(this.popoverContent.classList),
          rect,
          selfRect
        );

      this.popoverContent.style.left = left + offsetX + "px";
      this.popoverContent.style.top = top + offsetY + "px";
    }
  }

  getCaretCoordinates() {
    let x = 0,
      y = 0;
    const isSupported = typeof window.getSelection !== "undefined";
    if (isSupported) {
      const selection = window.getSelection();
      if (selection.rangeCount !== 0) {
        const range = selection.getRangeAt(0).cloneRange();
        // Collapse the range to the start, so there are not multiple chars selected
        range.collapse(true);
        const rect = range.getClientRects()[0];
        if (rect) {
          x = rect.left; // since the caret is only 1px wide, left == right
          y = rect.top; // top edge of the caret
        }
      }
    }
    return { x, y };
  }
}

window.mentionEditor = new Editor();
