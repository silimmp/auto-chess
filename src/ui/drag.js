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
    cachedRects: null,
    dragRect: null,
    frameRequested: false,
    previewMode: "",
  };
}

function snapshotRect(rect) {
  if (!rect) {
    return null;
  }
  // Copy the live DOMRect into a plain object so drag hit-testing stays stable between frames.
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function bindPrepCardInteractions(card, zone, index, disabled) {
  card.dataset.zone = zone;
  card.dataset.index = String(index);
  const shouldEnable = !disabled;
  if (shouldEnable) {
    card.classList.add("draggable-card");
  } else {
    card.classList.remove("draggable-card");
  }
  if (card.__prepPointerBound) {
    return;
  }
  card.__prepPointerBound = true;
  card.addEventListener("pointerdown", (event) => {
    if (!card.classList.contains("draggable-card")) {
      return;
    }
    beginCardDragPress(event, card.dataset.zone, Number(card.dataset.index), card);
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
  requestDragFrame();
}

function requiresLongPressDrag(pointerType) {
  return pointerType === "touch";
}

function handleGlobalPointerUp(event) {
  if (dragRuntime.dragState.status === "idle" || event.pointerId !== dragRuntime.dragState.pointerId) {
    return;
  }

  if (dragRuntime.dragState.status === "active") {
    dragRuntime.dragState.pointerX = event.clientX;
    dragRuntime.dragState.pointerY = event.clientY;
    flushDragFrame();
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
  const isBrandSpell = dragRuntime.dragState.sourceElement.classList.contains("brand-card");
  const preview = isBrandSpell ? createArrowPreview() : dragRuntime.dragState.sourceElement.cloneNode(true);
  preview.classList.add("drag-preview");
  if (isBrandSpell) {
    preview.classList.add("drag-preview-arrow");
    preview.style.inset = "0";
    preview.style.width = "100vw";
    preview.style.height = "100vh";
  } else {
    preview.style.width = `${rect.width}px`;
    preview.style.height = `${rect.height}px`;
    preview.style.left = "0";
    preview.style.top = "0";
    preview.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(-1deg) scale(1.04)`;
  }
  document.body.appendChild(preview);

  dragRuntime.dragState.status = "active";
  dragRuntime.dragState.previewElement = preview;
  dragRuntime.dragState.previewMode = isBrandSpell ? "arrow" : "card";
  dragRuntime.dragState.offsetX = dragRuntime.dragState.startX - rect.left;
  dragRuntime.dragState.offsetY = dragRuntime.dragState.startY - rect.top;
  dragRuntime.dragState.dragRect = snapshotRect(rect);
  dragRuntime.dragState.sourceElement.classList.remove("touch-press-armed");
  dragRuntime.dragState.sourceElement.classList.add("drag-source");
  document.body.classList.add("dragging-card");
  if (requiresLongPressDrag(dragRuntime.dragState.pointerType)) {
    document.body.classList.add("touch-drag-active");
  }
  if (dragRuntime.dragState.sourceZone === "hand") {
    dragRuntime.prepZones.hand?.classList.add("drag-active");
  }
  dragRuntime.dragState.cachedRects = collectDragRects();

  flushDragFrame();
}

function updateDragPreviewPosition(clientX, clientY) {
  if (!dragRuntime.dragState.previewElement) {
    return;
  }

  if (dragRuntime.dragState.previewMode === "arrow") {
    updateArrowPreviewShape(clientX, clientY);
    return;
  }

  const x = clientX - dragRuntime.dragState.offsetX;
  const y = clientY - dragRuntime.dragState.offsetY;
  dragRuntime.dragState.previewElement.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(-1deg) scale(1.04)`;
}

function createArrowPreview() {
  const preview = document.createElement("div");
  preview.innerHTML = `
    <svg class="drag-preview-arrow-svg" aria-hidden="true">
      <path class="drag-preview-arrow-shadow" d=""></path>
      <path class="drag-preview-arrow-core" d=""></path>
      <path class="drag-preview-arrow-head" d=""></path>
    </svg>
    <div class="drag-preview-arrow-label"></div>
  `;
  return preview;
}

function updateArrowPreviewShape(clientX, clientY) {
  const preview = dragRuntime.dragState.previewElement;
  if (!preview) {
    return;
  }

  const svg = preview.querySelector(".drag-preview-arrow-svg");
  const shadow = preview.querySelector(".drag-preview-arrow-shadow");
  const core = preview.querySelector(".drag-preview-arrow-core");
  const head = preview.querySelector(".drag-preview-arrow-head");
  const label = preview.querySelector(".drag-preview-arrow-label");
  const sourceRect = dragRuntime.dragState.sourceElement?.getBoundingClientRect() || dragRuntime.dragState.dragRect;
  if (!svg || !shadow || !core || !head || !sourceRect) {
    return;
  }

  svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("width", String(window.innerWidth));
  svg.setAttribute("height", String(window.innerHeight));

  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height * 0.44;
  const deltaX = clientX - sourceX;
  const deltaY = clientY - sourceY;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const bend = clampArrowBend(distance);
  const control1X = sourceX + deltaX * 0.25;
  const control1Y = sourceY + Math.sign(deltaY || 1) * bend;
  const control2X = clientX - deltaX * 0.18;
  const control2Y = clientY - Math.sign(deltaY || 1) * bend * 0.72;
  const arrowHead = buildArrowHeadGeometry(control2X, control2Y, clientX, clientY);
  const path = `M ${sourceX} ${sourceY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${arrowHead.shaftX} ${arrowHead.shaftY}`;

  shadow.setAttribute("d", path);
  core.setAttribute("d", path);
  head.setAttribute("d", arrowHead.path);
  label.textContent = dragRuntime.dragState.sourceElement?.querySelector(".minion-name")?.textContent || "";
  preview.style.setProperty("--arrow-source-x", `${sourceX}px`);
  preview.style.setProperty("--arrow-source-y", `${sourceY}px`);
}

function clampArrowBend(distance) {
  return Math.max(24, Math.min(88, distance * 0.16));
}

function buildArrowHeadGeometry(fromX, fromY, tipX, tipY) {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const headLength = 20;
  const headWidth = 11;
  const backX = tipX - Math.cos(angle) * headLength;
  const backY = tipY - Math.sin(angle) * headLength;
  const leftX = backX + Math.cos(angle + Math.PI / 2) * headWidth;
  const leftY = backY + Math.sin(angle + Math.PI / 2) * headWidth;
  const rightX = backX + Math.cos(angle - Math.PI / 2) * headWidth;
  const rightY = backY + Math.sin(angle - Math.PI / 2) * headWidth;
  return {
    path: `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`,
    shaftX: backX,
    shaftY: backY,
  };
}

function updateDropTargetState(clientX, clientY) {
  const hoveredZone = getPriorityDropZone(clientX, clientY);
  const zone = isValidDropZone(dragRuntime.dragState.sourceZone, hoveredZone) ? hoveredZone : "";
  const index =
    dragRuntime.dragState.sourceZone === "shop" ? -1 : zone === "hand" || zone === "board" ? getDropIndex(zone, clientX) : -1;
  const zoneChanged = dragRuntime.dragState.currentZone !== zone;
  const indexChanged = dragRuntime.dragState.currentIndex !== index;

  dragRuntime.dragState.currentZone = zone;
  dragRuntime.dragState.currentIndex = index;
  dragRuntime.dragState.currentSlotLabel = zone === "board" && index >= 0 ? `将放在第 ${index + 1} 位` : "";

  if (!zoneChanged && !indexChanged) {
    return;
  }

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
    return pointerZone;
  }

  const dragRect = getActiveDragRect();
  if (!dragRect) {
    return "";
  }

  const handRatio = getOverlapRatio(dragRect, getZoneRect("hand"));
  const boardRatio = getOverlapRatio(dragRect, getZoneRect("board"));

  if (boardRatio >= 0.28) {
    return "board";
  }
  if (handRatio >= 0.28) {
    return "hand";
  }
  return "";
}

function getActiveDragRect() {
  if (dragRuntime.dragState.dragRect) {
    return dragRuntime.dragState.dragRect;
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
  const handRect = getZoneRect("hand");
  const boardRect = getZoneRect("board");
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
  const prepPanelRect = dragRuntime.dragState.cachedRects?.prepPanel || dragRuntime.elements.prepPanel?.getBoundingClientRect();
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
    return targetZone === "hand" || targetZone === "board";
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
    const rect = getZoneRect(zone);
    if (!rect) {
      continue;
    }

    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return zone;
    }
  }
  return "";
}

function getDropIndex(zone, clientX) {
  const cards = getCachedCardRects(zone);
  if (!cards) {
    return -1;
  }

  const dragRect = getActiveDragRect();
  const probeX = dragRect ? dragRect.left + dragRect.width / 2 : clientX;
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index];
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
    if (targetZone === "hand" || targetZone === "board") {
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
  dragRuntime.dragState.frameRequested = false;

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
  dragRuntime.dragState.previewMode = "";
  Object.entries(dragRuntime.prepZones).forEach(([key, element]) => {
    if (key === "shared") {
      element?.classList.remove("drop-target");
      return;
    }
    element?.classList.remove("drop-target");
    if (key === "hand") {
      element?.classList.remove("drag-active");
    }
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

function requestDragFrame() {
  if (dragRuntime.dragState.frameRequested) {
    return;
  }
  dragRuntime.dragState.frameRequested = true;
  window.requestAnimationFrame(() => {
    if (dragRuntime.dragState.status !== "active") {
      dragRuntime.dragState.frameRequested = false;
      return;
    }
    flushDragFrame();
  });
}

function flushDragFrame() {
  dragRuntime.dragState.frameRequested = false;
  if (dragRuntime.dragState.previewElement) {
    const left = dragRuntime.dragState.pointerX - dragRuntime.dragState.offsetX;
    const top = dragRuntime.dragState.pointerY - dragRuntime.dragState.offsetY;
    const { width, height } = dragRuntime.dragState.dragRect;
    // Rebuild the preview rect from pointer coordinates to avoid layout reads in the hot path.
    dragRuntime.dragState.dragRect = {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  }
  updateDragPreviewPosition(dragRuntime.dragState.pointerX, dragRuntime.dragState.pointerY);
  updateDropTargetState(dragRuntime.dragState.pointerX, dragRuntime.dragState.pointerY);
}

function collectDragRects() {
  return {
    prepPanel: dragRuntime.elements.prepPanel?.getBoundingClientRect() || null,
    zones: Object.fromEntries(
      Object.entries(dragRuntime.prepZones).map(([key, element]) => [key, element?.getBoundingClientRect() || null])
    ),
    cards: {
      hand: collectZoneCardRects("hand"),
      board: collectZoneCardRects("board"),
    },
  };
}

function collectZoneCardRects(zone) {
  const container = getZoneElement(zone);
  if (!container) {
    return [];
  }
  return [...container.querySelectorAll(".minion-card:not(.drag-source)")].map((card) => snapshotRect(card.getBoundingClientRect()));
}

function getZoneRect(zone) {
  return dragRuntime.dragState.cachedRects?.zones?.[zone] || dragRuntime.prepZones[zone]?.getBoundingClientRect() || null;
}

function getCachedCardRects(zone) {
  return dragRuntime.dragState.cachedRects?.cards?.[zone] || collectZoneCardRects(zone);
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
