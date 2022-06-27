var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class Editor {
    constructor() {
        this.dotnetReference = null;
        this.selection = null;
        this.editing = false;
        this.isPopoverOpen = false;
        if (typeof window.getSelection === "undefined") {
            // we depend on window.getSelection existing
            throw new Error("your browser do not support window.getSelection! The editor will not work properly");
        }
    }
    // this method will be called when the component is disposed (called in C#)
    dispose() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
    }
    initialize(reference) {
        var _a;
        this.dotnetReference = reference;
        this.content = document.getElementsByClassName("editor")[0];
        // XXX: for now we don't check if the content is empty or not
        (_a = this.content) === null || _a === void 0 ? void 0 : _a.setAttribute("data-mentiontextareaempty", "");
        const listener = this.content.addEventListener;
        // XXX: if we don't filter this event we'll send at least two input events with the same data
        // this is breaking the flow and the layout of the editor
        this.content.addEventListener("compositionend", (ev) => __awaiter(this, void 0, void 0, function* () { return yield this.updateEditorContent(); }));
        this.content.addEventListener("input", (ev) => __awaiter(this, void 0, void 0, function* () {
            if (!ev.isComposing) {
                yield this.updateEditorContent();
            }
        }));
        listener("keyup", (_) => (this.location = this.getCaretLocation()));
        listener("focus", (_) => (this.location = this.getCaretLocation()));
        listener("click", (_) => (this.location = this.getCaretLocation()));
        listener("paste", (ev) => __awaiter(this, void 0, void 0, function* () {
            var _b;
            const text = (_b = ev.clipboardData) === null || _b === void 0 ? void 0 : _b.getData("text");
            const selection = window.getSelection();
            if (!(selection === null || selection === void 0 ? void 0 : selection.rangeCount))
                return false;
            selection.deleteFromDocument();
            selection.getRangeAt(0).insertNode(document.createTextNode(text));
            selection.collapseToEnd();
            ev.preventDefault();
            yield this.updateEditorContent();
        }));
        listener("keydown", (event) => __awaiter(this, void 0, void 0, function* () {
            const ev = event;
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
        }));
    }
    updateEditorContent() {
        return __awaiter(this, void 0, void 0, function* () {
            const selection = window.getSelection();
            if (selection === null || selection === void 0 ? void 0 : selection.anchorNode) {
                const line = this.nodeToLine(selection.anchorNode);
                if (line) {
                    const offset = this.getCaretOffsetInLine(line, selection);
                    yield this.emitEditorUpdate(line, offset);
                }
            }
        });
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
        var _a, _b;
        const lines = (_b = (_a = this.content) === null || _a === void 0 ? void 0 : _a.querySelectorAll(`[data-line]`)) !== null && _b !== void 0 ? _b : [];
        if (lines.length > 1) {
            return false;
        }
        return this.isLineEmpty(lines[0]);
    }
    nodeToElement(node) {
        if (node instanceof Element || node === null) {
            return node;
        }
        return this.nodeToElement(node === null || node === void 0 ? void 0 : node.parentNode);
    }
    nodeToLine(node) {
        let el = this.nodeToElement(node);
        if (el === null || el === void 0 ? void 0 : el.hasAttribute("data-line")) {
            return el;
        }
        if (el === null || el === void 0 ? void 0 : el.hasAttribute("data-word")) {
            return this.nodeToLine(el.parentElement);
        }
        return null;
    }
    getLineAt(row) {
        const children = this.content.children;
        if (row > children.length) {
            // row = 0;
            throw new Error("row is out of content range");
        }
        return children[row];
    }
    getWordAt(row, col) {
        const line = this.getLineAt(row);
        for (let word of line.querySelectorAll("[data-word]")) {
            const start = parseInt(word.getAttribute("data-wordstart"), 10);
            const end = parseInt(word.getAttribute("data-wordend"), 10);
            // XXX: sometimes we must return it when col is just < end
            if (col >= start && col <= end) {
                return word;
            }
        }
    }
    getCaretOffsetInLine(line, sel) {
        const range = sel.getRangeAt(0);
        const clone = range.cloneRange();
        // basically select the entire line
        clone.selectNodeContents(line);
        // then reduce the selection to the mark at end
        clone.setEnd(range.endContainer, range.endOffset);
        // now counting the length of the selected string will result in the caret position
        return clone.toString().length;
    }
    getCaretLocation() {
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
    setCaretInLine(line, col) {
        const selection = window.getSelection();
        const range = new Range();
        let word = null;
        let offset = col;
        // find the word and the offset inside in line based on the col
        for (let child of line.children) {
            const len = child.innerText.length;
            offset -= len;
            if (offset <= 0) {
                word = child;
                offset = len + offset;
                break;
            }
        }
        if (!(word === null || word === void 0 ? void 0 : word.firstChild)) {
            throw new Error("setCaretInLine: cannot set caret in null element");
        }
        range.setStart(word.firstChild, offset);
        range.collapse(true);
        // FIXME: selection can be null
        selection.removeAllRanges();
        selection.addRange(range);
    }
    getContent() {
        if (!this.isContentEmpty()) {
            return this.content.innerText;
        }
        return "";
    }
    emitEditorUpdate(line, offset) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.editing) {
                    this.editing = true;
                    const content = line.innerText;
                    const tokens = yield this.dotnetReference.invokeMethodAsync("Tokenizer", content);
                    const newLine = this.newLineFromTokens(tokens);
                    if (line) {
                        (_a = this.content) === null || _a === void 0 ? void 0 : _a.replaceChild(newLine, line);
                    }
                    else {
                        (_b = this.content) === null || _b === void 0 ? void 0 : _b.appendChild(newLine);
                    }
                    this.setCaretInLine(newLine, offset);
                    this.location = this.getCaretLocation();
                    const { word } = this.location;
                    if (word === null || word === void 0 ? void 0 : word.hasAttribute("data-mention")) {
                        const rect = word === null || word === void 0 ? void 0 : word.getBoundingClientRect();
                        yield this.dotnetReference.invokeMethodAsync("OnMention", word.innerText, rect.top, rect.left);
                    }
                }
            }
            finally {
                if (this.isContentEmpty()) {
                    (_c = this.content) === null || _c === void 0 ? void 0 : _c.setAttribute("data-mentiontextareaempty", "");
                }
                else {
                    (_d = this.content) === null || _d === void 0 ? void 0 : _d.removeAttribute("data-mentiontextareaempty");
                }
                this.editing = false;
            }
        });
    }
    createTextNodeFromToken(token) {
        const el = document.createElement("span");
        el.innerText = token.value;
        for (let attr in token.attributes) {
            el.setAttribute(attr, token.attributes[attr]);
            if (attr === "data-mention") {
                el.addEventListener("mouseenter", (ev) => __awaiter(this, void 0, void 0, function* () {
                    const word = ev.target;
                    const rect = word.getBoundingClientRect();
                    yield this.dotnetReference.invokeMethodAsync("MentionTooltipOpen", {
                        marker: word.getAttribute("data-mention"),
                        query: word.innerText.substring(1),
                        top: rect.top,
                        left: rect.left,
                    });
                }));
                el.addEventListener("mouseleave", (ev) => __awaiter(this, void 0, void 0, function* () {
                    yield this.dotnetReference.invokeMethodAsync("MentionTooltipClose");
                }));
            }
        }
        return el;
    }
    newLineFromTokens(tokens) {
        const line = document.createElement("div");
        line.setAttribute("data-line", "");
        for (let token of tokens) {
            const el = this.createTextNodeFromToken(token);
            line.appendChild(el);
        }
        return line;
    }
    clearEditor() {
        var _a;
        while ((_a = this.content) === null || _a === void 0 ? void 0 : _a.firstChild) {
            this.content.removeChild(this.content.firstChild);
        }
    }
    insertMentionAtHighlighted(username) {
        return __awaiter(this, void 0, void 0, function* () {
            const { word } = this.location;
            if (word) {
                const marker = word.getAttribute("data-mention");
                word.innerText = marker + username + " ";
                const selection = window.getSelection();
                if (selection) {
                    const range = new Range();
                    range.setEndAfter(word);
                    range.collapse();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    yield this.updateEditorContent();
                }
            }
        });
    }
    isPopoverVisible(status) {
        return __awaiter(this, void 0, void 0, function* () {
            this.isPopoverOpen = status;
        });
    }
}
export const editor = new Editor();
//# sourceMappingURL=editor.js.map