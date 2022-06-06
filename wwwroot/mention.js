const mentionPopoverElementName = "_mentionBoxPopover";
const mentionBoxContainerName = "_mentionBoxContainer";

let mentionContainer = undefined;

function initializeMentionBox(element) {
  mentionContainer = document.getElementById(mentionBoxContainerName);
  if (mentionContainer) {
    // resize the mention box when the screen (mention box container) is resized
    new ResizeObserver(updateMentionBoxPopoverWidth).observe(mentionContainer);
  }

  // XXX: we need to prevent default to some keys that should be handled when
  // the mention box is opened
  element?.addEventListener("keydown", (ev) => {
    // check if the mention popover is open
    let mp = document.getElementsByClassName("_mentionBoxPopover");
    if (mp.length > 0) {
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

function updateMentionBoxPopoverWidth() {
  const popover = document.getElementsByClassName(mentionPopoverElementName)[0];
  if (popover && mentionContainer) {
    popover.style.width = `${mentionContainer.offsetWidth}px`;
  }
}

function getElementCaretPosition(element) {
  return element?.selectionStart ?? 0;
}

function updateMentionBoxText(element, text, position) {
  element.value = text;
  element.focus();
  element.selectionEnd = position;
}

function getElementWidthById(id) {
  return document.getElementById(id)?.offsetWidth ?? 0;
}
