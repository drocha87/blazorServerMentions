var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class PopoverPlacer {
    constructor() {
        this.popover = null;
        this.offsetTop = 0;
        this.offsetLeft = 0;
    }
    initialize(containerId) {
        var _a;
        // get the popover content, so we can positionate it according to the mention
        let popoverElement = (_a = document.getElementById(containerId)) === null || _a === void 0 ? void 0 : _a.firstElementChild;
        if (!popoverElement) {
            throw new Error(`popoverElement with id ${containerId} is not in the DOM`);
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
                for (const mutation of mutationList) {
                    if (mutation.type === "attributes") {
                        const el = mutation.target;
                        if (el.classList.contains("mud-popover-open")) {
                            const selfRect = this.popover.getBoundingClientRect();
                            this.placePopover(selfRect.height);
                        }
                    }
                }
            }));
            mutationObserver.observe(this.popover, config);
            const resizeObserver = new ResizeObserver((entries) => __awaiter(this, void 0, void 0, function* () {
                const entry = entries[0];
                this.placePopover(entry.contentRect.height);
            }));
            resizeObserver.observe(this.popover);
        }
    }
    placePopover(height) {
        if (this.popover) {
            this.popover.style.top = `${this.offsetTop - height - 2}px`;
            this.popover.style.left = `${this.offsetLeft}px`;
        }
    }
    updateOffsets(top, left) {
        this.offsetTop = top;
        this.offsetLeft = left;
    }
}
export const popoverPlacer = new PopoverPlacer();
//# sourceMappingURL=PopoverPlacer.js.map