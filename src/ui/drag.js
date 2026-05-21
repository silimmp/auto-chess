function createDragState() {
  return {
    status: "idle",
    pointerId: null,
    sourceZone: "",
    sourceIndex: -1,
    sourceElement: null,
    previewElement: null,
    pointerType: "",
    startX: 0,
    startY: 0,
    pointerX: 0,
    pointerY: 0,
    offsetX: 0,
    offsetY: 0,
    timerId: null,
    currentZone: "",
    currentIndex: -1,
    currentSlotLabel: "",
  };
}

function bindPrepCardInteractions(card, zone, index, disabled) {
  card.dataset.zone = zone;
  card.dataset.index = String(index);
  if (disabled) {
    return;
  }

  card.classList.add("draggable-card");
  card.addEventListener("pointerdown", (event) => {
    beginCardDragPress(event, zone, index, card);
  });
}

function beginCardDragPress(event, zone, index, card) {
  if (event.button !== 0 || dragRuntime.state.phase !== "prep" || dragRuntime.state.hp <= 0 || dragRuntime.state.discover) {
    return;
  }
  if (event.target.closest("button")) {
    return;
  }

  cancelDragInteraction();
  dragRuntime.actions.clearTouchSelection?.(false);
  event.preventDefault();

  try {
    card.setPointerCapture(event.pointerId);
  } catch (error) {
    // Ignore capture failures on unsupported browsers.
  }

  dragRuntime.setDragState({
    ...createDragState(),
    status: "pending",
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    sourceZone: zone,
    sourceIndex: index,
    sourceElement: card,
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
  });

  if (requiresLongPressDrag(dragRuntime.dragState.pointerType)) {
    card.classList.add("touch-press-armed");
    document.body.classList.add("touch-press-mode");
    dragRuntime.dragState.timerId = window.setTimeout(() => {
      activateDrag();
    }, TOUCH_LONG_PRESS_MS);
  }
}

function handleGlobalPointerMove(event) {
  if (dragRuntime.dragState.status === "idle" || event.pointerId !== dragRuntime.dragState.pointerId) {
    return;
  }

  dragRuntime.dragState.pointerX = event.clientX;
  dragRuntime.dragState.pointerY = event.clientY;

  if (dragRuntime.dragState.status === "pending") {
    const distance = Math.hypot(
      event.clientX - dragRuntime.dragState.startX,
      event.clientY - dragRuntime.dragState.startY
    );
    if (!requiresLongPressDrag(dragRuntime.dragState.pointerType) && distance >= POINTER_DRAG_START_DISTANCE) {
      activateDrag();
      if (dragRuntime.dragState.status !== "active") {
        return;
      }
    } else if (requiresLongPressDrag(dragRuntime.dragState.pointerType) && distance > TOUCH_DRAG_CANCEL_DISTANCE) {
      cancelDragInteraction();
      return;
    } else {
      return;
    }
  }

  event.preventDefault();
  updateDragPreviewPosition(event.clientX, event.clientY);
  updateDropTargetState(event.clientX, event.clientY);
}

function requiresLongPressDrag(pointerType) {
  return pointerType === "touch";
}

function handleGlobalPointerUp(event) {
  if (dragRuntime.dragState.status === "idle" || event.pointerId !== dragRuntime.dragState.pointerId) {
    return;
  }

  const wasPending = dragRuntime.dragState.status === "pending";
  const shouldDrop = dragRuntime.dragState.status === "active";
  const payload = shouldDrop
    ? {
        sourceZone: dragRuntime.dragState.sourceZone,
        sourceIndex: dragRuntime.dragState.sourceIndex,
        targetZone: dragRuntime.dragState.currentZone,
        targetIndex: dragRuntime.dragState.currentIndex,
      }
    : null;
  const tapPurchase =
    wasPending && dragRuntime.dragState.sourceZone === "shop"
      ? {
          sourceIndex: dragRuntime.dragState.sourceIndex,
        }
      : null;
  const tapHandSelect =
    wasPending && dragRuntime.dragState.sourceZone === "hand" && requiresLongPressDrag(dragRuntime.dragState.pointerType)
      ? {
          sourceIndex: dragRuntime.dragState.sourceIndex,
        }
      : null;

  cleanupDragState();
  if (shouldDrop && payload) {
    applyCardDrop(payload);
    return;
  }
  if (tapPurchase) {
    dragRuntime.actions.buyMinion(tapPurchase.sourceIndex);
    return;
  }
  if (tapHandSelect) {
    dragRuntime.actions.toggleHandSelection?.(tapHandSelect.sourceIndex);
  }
}

function activateDrag() {
  if (dragRuntime.dragState.status !== "pending" || !dragRuntime.dragState.sourceElement?.isConnected) {
    cleanupDragState();
    return;
  }

  const rect = dragRuntime.dragState.sourceElement.getBoundingClientRect();
  const preview = dragRuntime.dragState.sourceElement.cloneNode(true);
  preview.classList.add("drag-preview");
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.left = `${rect.left}px`;
  preview.style.top = `${rect.top}px`;
  document.body.appendChild(preview);

  dragRuntime.dragState.status = "active";
  dragRuntime.dragState.previewElement = preview;
  dragRuntime.dragState.offsetX = dragRuntime.dragState.startX - rect.left;
  dragRuntime.dragState.offsetY = dragRuntime.dragState.startY - rect.top;
  dragRuntime.dragState.sourceElement.classList.remove("touch-press-armed");
  dragRuntime.dragState.sourceElement.classList.add("drag-source");
  document.body.classList.add("dragging-card");
  if (requiresLongPressDrag(dragRuntime.dragState.pointerType)) {
    document.body.classList.add("touch-drag-active");
  }

  updateDragPreviewPosition(dragRuntime.dragState.pointerX, dragRuntime.dragState.pointerY);
  updateDropTargetState(dragRuntime.dragState.pointerX, dragRuntime.dragState.pointerY);
}

function updateDragPreviewPosition(clientX, clientY) {
  if (!dragRuntime.dragState.previewElement) {
    return;
  }

  dragRuntime.dragState.previewElement.style.left = `${clientX - dragRuntime.dragState.offsetX}px`;
  dragRuntime.dragState.previewElement.style.top = `${clientY - dragRuntime.dragState.offsetY}px`;
}

function updateDropTargetState(clientX, clientY) {
  const hoveredZone = getPriorityDropZone(clientX, clientY);
  const zone = isValidDropZone(dragRuntime.dragState.sourceZone, hoveredZone) ? hoveredZone : "";
  const index = zone === "hand" || zone === "board" ? getDropIndex(zone, clientX) : -1;

  dragRuntime.dragState.currentZone = zone;
  dragRuntime.dragState.currentIndex = index;
  dragRuntime.dragState.currentSlotLabel = zone === "board" && index >= 0 ? `将放在第 ${index + 1} 位` : "";

  Object.entries(dragRuntime.prepZones).forEach(([key, element]) => {
    if (key === "shared") {
      return;
    }
    element?.classList.toggle("drop-target", key === zone);
    if (key === "board") {
      if (zone === "board" && index >= 0) {
        element?.style.setProperty("--drop-slot-index", String(index));
        element?.style.setProperty("--drop-slot-label", `"${dragRuntime.dragState.currentSlotLabel}"`);
      } else {
        element?.style.removeProperty("--drop-slot-index");
        element?.style.removeProperty("--drop-slot-label");
      }
    }
  });
  dragRuntime.prepZones.shared?.classList.toggle("drop-target", zone === "hand" || zone === "board");
  dragRuntime.elements.prepPanel?.classList.toggle("sell-armed", zone === "sell");
}

function getShopPurchaseZone() {
  const pointerZone = getDropZoneAtPoint(dragRuntime.dragState.pointerX, dragRuntime.dragState.pointerY);
  if (pointerZone === "hand" || pointerZone === "board") {
    return "hand";
  }

  const dragRect = getActiveDragRect();
  if (!dragRect) {
    return "";
  }

  const handRatio = getOverlapRatio(dragRect, dragRuntime.prepZones.hand?.getBoundingClientRect());
  const boardRatio = getOverlapRatio(dragRect, dragRuntime.prepZones.board?.getBoundingClientRect());

  if (handRatio >= 0.28 || boardRatio >= 0.28) {
    return "hand";
  }
  return "";
}

function getActiveDragRect() {
  if (dragRuntime.dragState.previewElement) {
    return dragRuntime.dragState.previewElement.getBoundingClientRect();
  }
  if (dragRuntime.dragState.sourceElement?.isConnected) {
    return dragRuntime.dragState.sourceElement.getBoundingClientRect();
  }
  return null;
}

function getOverlapRatio(sourceRect, targetRect) {
  if (!sourceRect || !targetRect) {
    return 0;
  }

  const overlapWidth = Math.max(
    0,
    Math.min(sourceRect.right, targetRect.right) - Math.max(sourceRect.left, targetRect.left)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(sourceRect.bottom, targetRect.bottom) - Math.max(sourceRect.top, targetRect.top)
  );

  if (overlapWidth === 0 || overlapHeight === 0) {
    return 0;
  }

  const overlapArea = overlapWidth * overlapHeight;
  const sourceArea = sourceRect.width * sourceRect.height;
  return sourceArea > 0 ? overlapArea / sourceArea : 0;
}

function getPriorityDropZone(clientX, clientY) {
  if (dragRuntime.dragState.sourceZone !== "shop" && isSellDropActive()) {
    return "sell";
  }

  if (dragRuntime.dragState.sourceZone === "shop") {
    return getShopPurchaseZone();
  }
  if (dragRuntime.dragState.sourceZone === "hand") {
    return getHandDeployZone(clientX, clientY);
  }
  return getDropZoneAtPoint(clientX, clientY);
}

function getHandDeployZone(clientX, clientY) {
  const pointerZone = getDropZoneAtPoint(clientX, clientY);
  if (pointerZone === "sell" || pointerZone === "board") {
    return pointerZone;
  }

  const upwardTravel = dragRuntime.dragState.startY - dragRuntime.dragState.pointerY;
  if (upwardTravel >= 72) {
    return "board";
  }

  const dragRect = getActiveDragRect();
  const handRect = dragRuntime.prepZones.hand?.getBoundingClientRect();
  const boardRect = dragRuntime.prepZones.board?.getBoundingClientRect();
  if (!dragRect || !handRect) {
    return pointerZone || "";
  }

  const boardRatio = getOverlapRatio(dragRect, boardRect);
  const liftedAboveTray = handRect.top - dragRect.top;
  const escapedTrayBand = dragRect.bottom <= handRect.top + 28;
  if (boardRatio >= 0.12 || liftedAboveTray >= 36 || escapedTrayBand) {
    return "board";
  }

  return "hand";
}

function isSellDropActive() {
  const dragRect = getActiveDragRect();
  const prepPanelRect = dragRuntime.elements.prepPanel?.getBoundingClientRect();
  if (!dragRect || !prepPanelRect) {
    return false;
  }

  return dragRect.top < prepPanelRect.top;
}

function isValidDropZone(sourceZone, targetZone) {
  if (!targetZone) {
    return false;
  }
  if (sourceZone === "shop") {
    return targetZone === "hand";
  }
  if (sourceZone === "hand") {
    return targetZone === "hand" || targetZone === "board" || targetZone === "sell";
  }
  if (sourceZone === "board") {
    return targetZone === "board" || targetZone === "sell";
  }
  return false;
}

function getDropZoneAtPoint(clientX, clientY) {
  const orderedZones = ["shop", "board", "hand", "shared"];
  for (const zone of orderedZones) {
    const element = dragRuntime.prepZones[zone];
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return zone;
    }
  }
  return "";
}

function getDropIndex(zone, clientX) {
  const container = getZoneElement(zone);
  if (!container) {
    return -1;
  }

  const cards = [...container.querySelectorAll(".minion-card:not(.drag-source)")];
  const dragRect = getActiveDragRect();
  const probeX = dragRect ? dragRect.left + dragRect.width / 2 : clientX;
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (probeX < rect.left + rect.width / 2) {
      return index;
    }
  }
  return cards.length;
}

function getZoneElement(zone) {
  if (zone === "shop") {
    return dragRuntime.elements.shop;
  }
  if (zone === "hand") {
    return dragRuntime.elements.hand;
  }
  if (zone === "board") {
    return dragRuntime.elements.board;
  }
  return null;
}

function applyCardDrop({ sourceZone, sourceIndex, targetZone, targetIndex }) {
  if (!targetZone) {
    return;
  }

  if (sourceZone === "shop") {
    if (targetZone === "hand") {
      dragRuntime.actions.buyMinion(sourceIndex);
    }
    return;
  }

  if (sourceZone === "hand") {
    if (targetZone === "sell") {
      dragRuntime.actions.sellMinionFromZone("hand", sourceIndex);
      return;
    }
    if (targetZone === "board") {
      dragRuntime.actions.playCardFromHand(sourceIndex, targetIndex);
      return;
    }
    if (targetZone === "hand") {
      dragRuntime.actions.moveHandMinion(sourceIndex, targetIndex);
    }
    return;
  }

  if (sourceZone === "board") {
    if (targetZone === "sell") {
      dragRuntime.actions.sellMinionFromZone("board", sourceIndex);
      return;
    }
    if (targetZone === "board") {
      dragRuntime.actions.moveBoardMinion(sourceIndex, targetIndex);
    }
  }
}

function cleanupDragState() {
  if (dragRuntime.dragState.timerId) {
    window.clearTimeout(dragRuntime.dragState.timerId);
  }

  if (dragRuntime.dragState.pointerId !== null) {
    try {
      dragRuntime.dragState.sourceElement?.releasePointerCapture?.(dragRuntime.dragState.pointerId);
    } catch (error) {
      // Ignore release failures.
    }
  }

  dragRuntime.dragState.sourceElement?.classList.remove("touch-press-armed");
  dragRuntime.dragState.sourceElement?.classList.remove("drag-source");
  dragRuntime.dragState.previewElement?.remove();
  Object.entries(dragRuntime.prepZones).forEach(([key, element]) => {
    if (key === "shared") {
      element?.classList.remove("drop-target");
      return;
    }
    element?.classList.remove("drop-target");
    if (key === "board") {
      element?.style.removeProperty("--drop-slot-index");
      element?.style.removeProperty("--drop-slot-label");
    }
  });
  dragRuntime.elements.prepPanel?.classList.remove("sell-armed");
  document.body.classList.remove("dragging-card");
  document.body.classList.remove("touch-drag-active");
  document.body.classList.remove("touch-press-mode");
  dragRuntime.setDragState(createDragState());
}

function cancelDragInteraction() {
  if (dragRuntime.dragState.status === "idle") {
    return;
  }
  cleanupDragState();
}

let dragRuntime = {
  actions: null,
  dragState: createDragState(),
  elements: null,
  prepZones: null,
  setDragState: null,
  state: null,
};

function configureDragRuntime(runtime) {
  dragRuntime = runtime;
}
