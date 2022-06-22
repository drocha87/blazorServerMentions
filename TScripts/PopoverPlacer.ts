class PopoverPlacer {
  popover: HTMLElement | null = null;
  offsetTop: number = 0;
  offsetLeft: number = 0;

  initialize(containerId: string) {
    // get the popover content, so we can positionate it according to the mention
    let popoverElement =
      document.getElementById(containerId)?.firstElementChild;

    if (!popoverElement) {
      throw new Error(
        `popoverElement with id ${containerId} is not in the DOM`
      );
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
      );
      mutationObserver.observe(this.popover, config);

      const resizeObserver = new ResizeObserver(async (entries) => {
        const entry = entries[0];
        this.placePopover(entry.contentRect.height);
      });
      resizeObserver.observe(this.popover);
    }
  }

  placePopover(height: number) {
    if (this.popover) {
      this.popover.style.top = `${this.offsetTop - height - 2}px`;
      this.popover.style.left = `${this.offsetLeft}px`;
    }
  }

  updateOffsets(top: number, left: number) {
    this.offsetTop = top;
    this.offsetLeft = left;
  }
}

export const popoverPlacer = new PopoverPlacer();