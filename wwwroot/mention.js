const mentionPopoverElementName = "_mentionBoxPopover";
const mentionBoxContainerName = "_mentionBoxContainer";

let mentionContainer = undefined;

function updateFakeTextareaRect(element) {
  const rect = element.getBoundingClientRect();

  const fakeTextarea = document.getElementsByClassName("fake-textarea")[0];
  const fakeContainer = document.getElementById("fake-container");

  if (fakeTextarea && fakeContainer) {
    const rectContainer = fakeContainer.getBoundingClientRect();
    fakeTextarea.style.top = `${rect.top - rectContainer.top}px`;
    fakeTextarea.style.bottom = `${rectContainer.bottom - rect.bottom}px`;
    fakeTextarea.style.left = `${rect.left - rectContainer.left}px`;
    fakeTextarea.style.right = `${rectContainer.right - rect.right}px`;
  }
}

function initializeMentionBox(element) {
  mentionContainer = document.getElementById(mentionBoxContainerName);
  if (mentionContainer) {
    // resize the mention box when the screen (mention box container) is resized
    new ResizeObserver(updateMentionBoxPopoverWidth).observe(mentionContainer);
  }

  // set the element style
  if (element) {
    updateFakeTextareaRect(element);
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

  // XXX: our textarea should grow the height based on the content, so we can avoid
  // scrollbar which will make our life a lot harder to keep the fake-textarea synced
  element?.addEventListener("keyup", (ev) => {
    element.style.height = Math.max(element.scrollHeight, element.clientHeight) + "px";
    updateFakeTextareaRect(element);
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
