// this enum is defined in MentionTextare.razor.cs
const TokenType = {
  Mention: 0,
  Text: 1,
};

class Editor {
  dotnetReference = null;
  content = null;
  popoverContent = null;
  mutationObserver = null;
  selection = null;

  highlightedMention = null;
  lastHighlightedWord = null;
  lastHighlightedLine = null;
  currentCaretLocation = { row: 0, col: 0, isCollapsed: false };
  config = {};

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

  initialize(reference) {
    this.dotnetReference = reference;

    this.content = document.getElementsByClassName("editor")[0];

    this.config.highlightWord = this.content.hasAttribute("data-highlightword");

    // start the editor with an empty line
    this.appendNewLineEditor();
    this.initializeMutationObserver();
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

    // this is how we update the interface. We look if the selectionchange and only if
    // it happened inside our component we dispatch a updateInterface().
    document.addEventListener("selectionchange", async (ev) => {
      if (ev.target.activeElement === this.content) {
        this.selection = document.getSelection();

        await this.updateInterface();
      }
    });

    this.content.addEventListener("keydown", (ev) => {
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
      }
    });

    this.content.addEventListener("click", async (ev) => {
      await this.updateInterface();
    });

    this.content.addEventListener("blur", (ev) => {
      this.clearHighlightedWord();
    });

    this.content.addEventListener("focus", async (ev) => {
      await this.updateInterface();
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

    const callback = function (mutationList, observer) {
      for (const mutation of mutationList) {
        if (mutation.type === "attributes") {
          switch (mutation.attributeName) {
            case "data-highlightword":
              window.mentionEditor.config.highlightWord =
                mutation.target.hasAttribute("data-highlightword");
              break;

            case "data-highlightline":
              window.mentionEditor.config.highlightLine =
                mutation.target.hasAttribute("data-highlightline");
              break;

            default:
              break;
          }
        }
      }
    };

    this.mutationObserver = new MutationObserver(callback);
    this.mutationObserver.observe(this.content, config);
  }

  async updateInterface() {
    this.currentCaretLocation = this.getEditorCaretLocation();
    if (this.currentCaretLocation) {
      const { row, col, isCollapsed } = this.currentCaretLocation;

      if (this.isContentEmpty()) {
        await this.dotnetReference.invokeMethodAsync("OnUpdateStats", 1, 1);
        return;
      }

      if (isCollapsed) {
        const word = this.getWordAt(row, col);

        if (word.hasAttribute("data-mention")) {
          this.highlightedMention = word;
          await this.dotnetReference.invokeMethodAsync(
            "OnMention",
            word.innerText
          );
        } else {
          if (this.isMentionPopoverOpen) {
            await this.dotnetReference.invokeMethodAsync(
              "OnCloseMentionPopover"
            );
          }
          this.highlightWordUnderCaret(word);
        }

        this.highlightCurrentLine();
        await this.dotnetReference.invokeMethodAsync(
          "OnUpdateStats",
          row + 1,
          col + 1
        );
      }
    }
  }

  isLineEmpty(line) {
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
    const lines = this.content.querySelectorAll(`[data-line]`);
    if (lines.length > 1) {
      return false;
    }
    return this.isLineEmpty(lines[0]);
  }

  nodeIsInContent(node) {
    if (node) {
      const el = this.nodeToElement(node);
      if (el && (el.hasAttribute("data-word") || el.hasAttribute("data-line"))) {
        return true;
      }
    }
    return false;
  }

  nodeToElement(node) {
    if (node instanceof Element) {
      return node;
    }
    return node && this.nodeToElement(node.parentNode);
  }

  nodeToLine(node) {
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
    this.content.appendChild(line);
    return line;
  }

  getLineAt(row) {
    if (row > this.content.length) {
      row = 0;
    }
    return this.content.children[row];
  }

  // This text editor has a line which is defined as following:
  //     <div data-line> ...<span data-word></span> </div>
  // But the column is an index as if the line was composed only by text.
  // So this helper function will calculate the `index` which is the index in the
  // line children and an `offset` the character position in the child (element at index)
  getWordIndexAndOffset(line, offset) {
    for (let [index, word] of [...line.children].entries()) {
      const len = word.innerText.length;
      if (len >= offset) {
        return { index, offset };
      }
      offset -= len;
    }
    // FIXME: sometimes I reach this state, which should never happen!
    throw new Error(
      `offset ${offset} is not present in line ${line?.innerText}`
    );
  }

  getWordInLine(line, col) {
    const { index } = this.getWordIndexAndOffset(line, col);
    return [...line.children][index];
  }

  getWordAt(row, col) {
    const line = this.getLineAt(row);
    return this.getWordInLine(line, col);
  }

  getCaretIndexInContent(selection) {
    let node = selection.anchorNode;
    let line = this.nodeToLine(node);
    return Array.prototype.indexOf.call(this.content.children, line);
  }

  getCaretOffsetInLine(line, selection) {
    const range = selection.getRangeAt(0);
    const clone = range.cloneRange();
    // basically select the entire line
    clone.selectNodeContents(line);
    // then reduce the selection to the mark at end
    clone.setEnd(range.endContainer, range.endOffset);
    // now counting the length of the selected string will result in the caret position
    return clone.toString().length;
  }

  // this function try to get the caret location in the editor content.
  // if it succeed it returns the row and col (indexed by 1) otherwise it
  // return `null`
  getEditorCaretLocation() {
    if (this.selection) {
      const selection = this.selection;
      let row = this.getCaretIndexInContent(selection);

      if (row >= 0) {
        let line = this.nodeToLine(selection.anchorNode);
        let col = this.getCaretOffsetInLine(line, selection);

        return { row, col, isCollapsed: selection.isCollapsed };
      }
    }
    return null;
  }

  setCaretInLine(line, col) {
    const selection = window.getSelection();
    const range = new Range();

    const { index, offset } = this.getWordIndexAndOffset(line, col);
    const word = line.children[index];

    range.setStart(word.firstChild, offset);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  setEditorCaretLocation(line, row, col) {
    const range = new Range();
    const selection = window.getSelection();

    const { index, offset } = this.getWordIndexAndOffset(line, col);
    const word = line.children[index];

    range.setStart(word.firstChild, offset);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);

    this.currentCaretLocation = { row, col, isCollapsed: true };
  }

  getContent() {
    if (!this.isContentEmpty()) {
      return this.content.innerText;
    }
  }

  async emitEditorUpdate(event) {
    let line = null;
    if (this.isContentEmpty()) {
      line = this.content.firstElementChild;
      if (line?.childElementCount > 0) {
        const content = line.innerText;

        const span = document.createElement("span");
        span.setAttribute("data-word", "");
        span.innerText = content;

        line.replaceChild(span, line.firstChild);
      }
    } else {
      line = this.nodeToLine(this.selection.anchorNode);
      if (this.isLineEmpty(line)) {
        // FIXME: if line is empty and the last word in previous line is a mention
        // for some reason the new node create here will contain a data attribute `mention`
        // so we must clean it to close the popover.
        line?.firstElementChild?.removeAttribute("data-mention");
      }
    }

    if (line) {
      let offset = this.getCaretOffsetInLine(line, this.selection);
      const content = line.innerText;

      if (content?.length > 0 && content !== "\n") {
        const tokens = await this.dotnetReference.invokeMethodAsync(
          "ParseLine",
          content
        );
        line = this.updateLine(line, tokens);
        this.setCaretInLine(line, offset);
      }
    }
  }

  createTextNodeFromToken(token) {
    const el = document.createElement("span");
    el.innerText = token.value;
    el.setAttribute("data-word", "");

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

  updateLine(line, tokens) {
    if (line?.children.length === 0) {
      let newLine = document.createElement("div");
      newLine.setAttribute("data-line", "");
      // we are in an empty line
      for (let token of tokens) {
        const el = this.createTextNodeFromToken(token);
        newLine.appendChild(el);
      }
      this.content.replaceChild(newLine, line);
      return newLine;
    }

    const wordsInLine = line.children.length;

    for (let [index, token] of tokens.entries()) {
      const node = line.children[index];
      const el = this.createTextNodeFromToken(token);

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
    while (this.content.firstChild) {
      this.content.removeChild(this.content.firstChild);
    }
  }

  async insertMentionAtHighlighted(username) {
    if (this.highlightedMention) {
      this.highlightedMention.innerText = "@" + username;

      const selection = window.getSelection();

      const range = new Range();
      range.setEndAfter(this.highlightedMention);
      range.collapse();

      selection.removeAllRanges();
      selection.addRange(range);

      await this.emitEditorUpdate();
    }
  }

  highlightCurrentLine() {
    const line = this.getLineAt(this.currentCaretLocation.row);
    if (line) {
      this.lastHighlightedLine?.removeAttribute("data-currentline");
      line.setAttribute("data-currentline", "");
      this.lastHighlightedLine = line;
    }
  }

  clearHighlightedWord() {
    if (this.lastHighlightedWord) {
      this.lastHighlightedWord.removeAttribute("data-currentword");
    }
  }

  highlightWordUnderCaret(word) {
    this.clearHighlightedWord();

    if (word?.hasAttribute("data-word")) {
      this.lastHighlightedWord = word;
      word.setAttribute("data-currentword", "");
    }
  }

  get isMentionPopoverOpen() {
    return this.popoverContent.classList.contains("mud-popover-open");
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
}

window.mentionEditor = new Editor();
