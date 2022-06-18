var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// this enum is defined in MentionTextare.razor.cs
var TokenType;
(function (TokenType) {
    TokenType[TokenType["Mention"] = 0] = "Mention";
    TokenType[TokenType["Text"] = 1] = "Text";
})(TokenType || (TokenType = {}));
export class EditorContext {
    constructor(editor) {
        this.editor = editor;
        this.subscribers = [];
    }
    update() {
        var _a;
        this.location = this.editor.getEditorCaretLocation();
        if ((_a = this.location) === null || _a === void 0 ? void 0 : _a.line) {
            if (!this.editor.updatingEditorContent) {
                for (let subscriber of this.subscribers) {
                    subscriber(this);
                }
            }
        }
    }
    onChange(callback) {
        this.subscribers.push(callback);
    }
    isMention() {
        var _a, _b;
        return (_b = (_a = this.location) === null || _a === void 0 ? void 0 : _a.word) === null || _b === void 0 ? void 0 : _b.hasAttribute("data-mention");
    }
}
export class Editor {
    constructor() {
        this.dotnetReference = null;
        this.popover = null;
        this.selection = null;
        this.shouldRender = false;
        this.updatingEditorContent = false;
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
        this.dotnetReference = reference;
        this.content = document.getElementsByClassName("editor")[0];
        this.context = new EditorContext(this);
        // start the editor with an empty line
        this.appendNewLineEditor();
        this.initializeMutationObserver();
        this.initializeMentionPopover();
        // XXX: if we don't filter this event we'll send at least two input events with the same data
        // this is breaking the flow and the layout of the editor
        this.content.addEventListener("compositionend", (ev) => __awaiter(this, void 0, void 0, function* () {
            yield this.emitEditorUpdate();
        }));
        this.content.addEventListener("input", (ev) => __awaiter(this, void 0, void 0, function* () {
            if (!ev.isComposing) {
                yield this.emitEditorUpdate();
            }
        }));
        this.context.onChange((ctx) => __awaiter(this, void 0, void 0, function* () { return yield this.updateInterface(ctx); }));
        // this is how we update the interface. We look if the selectionchange and only if
        // it happened inside our component we dispatch a updateInterface().
        document.addEventListener("selectionchange", (ev) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.shouldRender = true;
            if (ev.target.activeElement === this.content) {
                this.selection = document.getSelection();
                (_a = this.context) === null || _a === void 0 ? void 0 : _a.update();
                // await this.updateInterface();
            }
        }));
        this.content.addEventListener("keyup", (ev) => {
            this.shouldRender = true;
        });
        this.content.addEventListener("keydown", (event) => {
            const ev = event;
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
            }
            else {
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
        this.content.addEventListener("click", (ev) => __awaiter(this, void 0, void 0, function* () {
            var _b;
            this.shouldRender = true;
            (_b = this.context) === null || _b === void 0 ? void 0 : _b.update();
        }));
        this.content.addEventListener("focus", (ev) => __awaiter(this, void 0, void 0, function* () {
            var _c;
            this.shouldRender = true;
            (_c = this.context) === null || _c === void 0 ? void 0 : _c.update();
        }));
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
                            const el = node;
                            if (el.hasAttribute("data-line")) {
                                // console.log("added: ", el);
                            }
                        }
                    }
                    if (mutation.removedNodes.length > 0) {
                        const node = mutation.removedNodes[0];
                        if (node instanceof HTMLElement) {
                            const el = node;
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
        this.mutationObserver.observe(this.content, config);
    }
    updateInterface(ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            this.clearHighlightedWord();
            this.clearHighlightedLine();
            const { row, col, word, line } = ctx.location;
            if (this.isContentEmpty()) {
                yield this.dotnetReference.invokeMethodAsync("OnUpdateStats", 1, 1);
                return;
            }
            this.highlightCurrentLine(ctx);
            let workingWord = word;
            if (!workingWord) {
                if (col > 0) {
                    // the caret is in the last line position
                    workingWord = this.getWordAt(row, col - 1);
                    if (!workingWord || this.isSpace(workingWord)) {
                        return;
                    }
                }
            }
            if (workingWord === null || workingWord === void 0 ? void 0 : workingWord.hasAttribute("data-mention")) {
                this.highlightedMention = workingWord;
                yield this.dotnetReference.invokeMethodAsync("OnMention", workingWord.innerText);
            }
            else {
                if (this.isMentionPopoverOpen) {
                    yield this.dotnetReference.invokeMethodAsync("OnCloseMentionPopover");
                }
                this.highlightWordUnderCaret(workingWord);
            }
            yield this.dotnetReference.invokeMethodAsync("OnUpdateStats", row + 1, col + 1);
        });
    }
    clearHighlightedWord() {
        var _a;
        const word = (_a = this.content) === null || _a === void 0 ? void 0 : _a.querySelector("[data-currentword]");
        word === null || word === void 0 ? void 0 : word.removeAttribute("data-currentword");
    }
    clearHighlightedLine() {
        var _a;
        const hl = (_a = this.content) === null || _a === void 0 ? void 0 : _a.querySelector("[data-currentline]");
        hl === null || hl === void 0 ? void 0 : hl.removeAttribute("data-currentline");
    }
    highlightCurrentLine(context) {
        var _a;
        if (context.location) {
            (_a = context.location.line) === null || _a === void 0 ? void 0 : _a.setAttribute("data-currentline", "");
        }
    }
    highlightWordUnderCaret(word) {
        if (this.isSpace(word)) {
            const previous = word.previousElementSibling;
            if (!previous || this.isSpace(previous)) {
                return;
            }
            word = previous;
        }
        word === null || word === void 0 ? void 0 : word.setAttribute("data-currentword", "");
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
        var _a;
        const line = document.createElement("div");
        const br = document.createElement("br");
        line.appendChild(br);
        line.setAttribute("data-line", "");
        line.classList.add("line");
        (_a = this.content) === null || _a === void 0 ? void 0 : _a.appendChild(line);
        return line;
    }
    getLineAt(row) {
        const children = this.content.children;
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
    getWordIndexAndOffset(line, col) {
        let index = 0;
        let offset = col;
        for (let word of line.querySelectorAll("[data-word]")) {
            index = parseInt(word.getAttribute("data-wordindex"), 10);
            const start = parseInt(word.getAttribute("data-wordstart"), 10);
            const end = parseInt(word.getAttribute("data-wordend"), 10);
            if (col >= start && col <= end) {
                break;
            }
            offset = col - end;
        }
        return { index, offset };
    }
    isSpace(word) {
        if (word === null || word === void 0 ? void 0 : word.hasAttribute("data-word")) {
            return /\s/g.test(word === null || word === void 0 ? void 0 : word.innerText);
        }
        return false;
    }
    getWordAt(row, col) {
        const line = this.getLineAt(row);
        for (let word of line.querySelectorAll("[data-word]")) {
            const start = parseInt(word.getAttribute("data-wordstart"), 10);
            const end = parseInt(word.getAttribute("data-wordend"), 10);
            if (col >= start && col < end) {
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
    getEditorCaretLocation() {
        if (this.selection) {
            const sel = this.selection;
            const node = sel.anchorNode;
            const line = this.nodeToLine(node);
            if (line && sel.isCollapsed) {
                const row = Array.prototype.indexOf.call(this.content.children, line);
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
    setCaretInLine(line, col) {
        const selection = window.getSelection();
        const range = new Range();
        const { index, offset } = this.getWordIndexAndOffset(line, col);
        const word = line.children[index];
        if (!(word === null || word === void 0 ? void 0 : word.firstChild)) {
            throw new Error("setCaretInLine: cannot set line in null element");
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
    }
    emitEditorUpdate() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.updatingEditorContent = true;
                let line = null;
                if (this.isContentEmpty()) {
                    line = (_a = this.content) === null || _a === void 0 ? void 0 : _a.firstElementChild;
                    if ((line === null || line === void 0 ? void 0 : line.childElementCount) && line.childElementCount > 0) {
                        const content = line.innerText;
                        const span = document.createElement("span");
                        span.setAttribute("data-word", "");
                        span.innerText = content;
                        line.replaceChild(span, line.firstChild);
                    }
                }
                else {
                    line = this.nodeToLine(this.selection.anchorNode);
                    if (line && this.isLineEmpty(line)) {
                        // FIXME: if line is empty and the last word in previous line is a mention
                        // for some reason the new node create here will contain a data attribute `mention`
                        // so we must clean it to close the popover.
                        (_b = line === null || line === void 0 ? void 0 : line.firstElementChild) === null || _b === void 0 ? void 0 : _b.removeAttribute("data-mention");
                    }
                }
                if (line) {
                    const offset = this.getCaretOffsetInLine(line, this.selection);
                    const content = line.innerText;
                    if ((content === null || content === void 0 ? void 0 : content.length) > 0 && content !== "\n") {
                        const tokens = yield this.dotnetReference.invokeMethodAsync("ParseLine", content);
                        line = this.updateLine(line, tokens);
                        this.setCaretInLine(line, offset);
                    }
                }
            }
            catch (e) {
                // TODO: handle exception here
                throw e;
            }
            finally {
                this.updatingEditorContent = false;
            }
        });
    }
    createTextNodeFromToken(token, location) {
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
    updateLine(line, tokens) {
        if (this.isLineEmpty(line)) {
            let newLine = document.createElement("div");
            newLine.setAttribute("data-line", "");
            this.content.replaceChild(newLine, line);
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
        var _a;
        while ((_a = this.content) === null || _a === void 0 ? void 0 : _a.firstChild) {
            this.content.removeChild(this.content.firstChild);
        }
    }
    insertMentionAtHighlighted(username) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.highlightedMention) {
                this.highlightedMention.innerText = "@" + username;
                const selection = window.getSelection();
                const range = new Range();
                range.setEndAfter(this.highlightedMention);
                range.collapse();
                selection.removeAllRanges();
                selection.addRange(range);
                yield this.emitEditorUpdate();
            }
        });
    }
    get isMentionPopoverOpen() {
        var _a, _b;
        return (_b = (_a = this.popover) === null || _a === void 0 ? void 0 : _a.classList.contains("mud-popover-open")) !== null && _b !== void 0 ? _b : false;
    }
    initializeMentionPopover() {
        var _a;
        // get the popover content, so we can positionate it according to the mention
        let popoverElement = (_a = document.getElementById("editor-popover-container")) === null || _a === void 0 ? void 0 : _a.firstElementChild;
        if (!popoverElement) {
            throw new Error("popoverElement is not in the DOM");
        }
        // strip the first 8 "popover-" string because the popover content use the same guid defined after it
        let popoverId = popoverElement.id.substring(8);
        this.popover = document.getElementById(`popovercontent-${popoverId}`);
        if (this.popover) {
            window.mudPopover.disconnect(popoverId);
            const config = {
                attributes: true,
            };
            const mutationObserver = new MutationObserver((mutationList, observe) => __awaiter(this, void 0, void 0, function* () {
                if (editor.highlightedMention) {
                    for (const mutation of mutationList) {
                        if (mutation.type === "attributes") {
                            const el = mutation.target;
                            if (el.classList.contains("mud-popover-open")) {
                                const selfRect = this.popover.getBoundingClientRect();
                                this.placePopover(selfRect.height);
                            }
                        }
                    }
                }
            }));
            mutationObserver.observe(this.popover, config);
            const resizeObserver = new ResizeObserver((entries) => __awaiter(this, void 0, void 0, function* () {
                const entry = entries[0];
                if (editor.highlightedMention) {
                    this.placePopover(entry.contentRect.height);
                }
            }));
            resizeObserver.observe(this.popover);
        }
    }
    placePopover(height) {
        if (this.popover) {
            const rect = this.highlightedMention.getBoundingClientRect();
            this.popover.style.top = `${rect.top - height - 2}px`;
            this.popover.style.left = `${rect.left}px`;
        }
    }
}
export const editor = new Editor();
//# sourceMappingURL=editor.js.map