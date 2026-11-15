// Drawing and gesture formulas from the frozen v5, scoped to one mounted screen.
function clamp(number) { return Math.min(1, Math.max(0, number)); }
function ease(value) { return 1 - Math.pow(1 - value, 3); }

export function unlockIconProgress(progress) {
  return clamp((progress - .245) / .53) * .73;
}

// Advance only time the browser can draw. A long stall must not consume the whole entrance.
export function unlockFrameSeconds(previous, now) {
  return Math.max(0, Math.min(32, now - previous)) / 1000;
}

export function unlockReleaseDuration(from, velocity) {
  return Math.round(680 - clamp((from - .08) / .92) * 100 - Math.min(35, Math.max(0, velocity) * 15));
}

export function unlockReleaseFrame(from, icons, unlocked, linear) {
  const time = clamp(linear);
  return {
    progress: unlocked ? from + (1 - from) * ease(time) : from * (1 - ease(time)),
    icons: unlocked ? icons + (1 - icons) * clamp((time - .12) / .88) : undefined,
  };
}

export function iconCell(element, index, columns) {
  const row = Math.floor(index / columns);
  const offset = (columns - 1) / 2 - index % columns;
  return { element, x: offset * 19, y: 78 - row * 49, delay: row * .057 + Math.abs(offset) * .035 };
}

export function drawDesktop(iconProgress, cells, dock, homebar, dockTravel = 38) {
  for (const { element, x, y, delay, initialScale = .59, keepBackdrop } of cells) {
    const local = clamp((iconProgress - delay) / (1 - delay));
    const spring = 1 + Math.pow(1 - local, 3) * (-Math.cos(local * 8) - .25 * Math.sin(local * 8));
    const spread = 1 - spring;
    if (keepBackdrop) element.style.visibility = local > 0 ? '' : 'hidden';
    else element.style.opacity = clamp(local * 1.6);
    element.style.transform = "translate3d(" + (x * spread) + "px," + (y * spread) + "px,0) scale(" + (initialScale + (1 - initialScale) * spring) + ")";
  }
  const dockProgress = clamp(iconProgress * 1.16);
  if (dock) {
    dock.style.opacity = clamp(dockProgress * 1.55);
    dock.style.transform = "translate3d(0," + ((1 - ease(dockProgress)) * dockTravel) + "px,0) scale(" + (.91 + .09 * ease(dockProgress)) + ")";
  }
  if (homebar) homebar.style.opacity = clamp(iconProgress * 1.5);
}

export function mountLockScreen(root, options) {

  function byId(id) { return root.querySelector("#" + id); }
  function block(element, show) { element.hidden = !show; }
  var phone = byId("phone"), zone = byId("unlockZone"), home = byId("homeContent");
  var frontArt = byId("frontArt"), backArt = byId("backArt");
  var lockWallpaper = byId("lockWallpaper"), homeWallpaper = byId("homeWallpaper");
  var wakeWallpaper = byId("wakeWallpaper"), wakeLayers = [];
  var pair = byId("pair"), depth = byId("depth"), panel = byId("panel");
  var clockLayer = byId("clockLayer"), lockControls = byId("lockControls"), handle = byId("handle");
  var apps = byId("apps"), dock = byId("dock"), homebar = byId("homebar");
  var homeWallpaperLayer = byId("homeWallpaperLayer");
  var live = !options.editor && !options.fixture;
  if (live) homeWallpaperLayer.hidden = true;
  var shades = phone.querySelectorAll(".shade");
  var lockMark = byId("lockMark");
  var queuedProgress, queuedIcons, dragFrame = 0, wakeFrame = 0, lastReveal, lastProgress, settlingTarget;
  var desktopProgress = 0, lastIcons;
  var mode = "lock", progress = 0, frame = 0, gesture = null, reveal = 1, screenHeight = 1;
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var lockImage = "", desktopImage = "", frontImage = "", paintingPair = true;

  var clockFace = byId("time"), clockLabel = byId("clockDigits").firstChild;
  var clockMaskCanvas = document.createElement("canvas");
  var clockMaskCtx = clockMaskCanvas.getContext("2d");
  var maskKey = "";
  var maskReady = !document.fonts;
  function updateClockMask() {
    if (!maskReady) return;
    if (!clockMaskCtx || !window.CSS || !CSS.supports ||
      !(CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")) ||
      !(CSS.supports("mask-image", "url(test.png)") || CSS.supports("-webkit-mask-image", "url(test.png)"))) return;
    var width = clockFace.offsetWidth, height = clockFace.offsetHeight;
    if (!width || !height) return;
    var css = getComputedStyle(clockFace);
    var label = clockLabel.nodeValue;
    var key = [width, height, css.fontSize, css.fontFamily, css.fontWeight, css.letterSpacing, label].join("|");
    if (key === maskKey) return;
    var outer = clockFace.getBoundingClientRect();
    var range = document.createRange();
    range.setStart(clockLabel, 0);
    range.setEnd(clockLabel, clockLabel.length);
    var glyph = range.getBoundingClientRect();
    if (!glyph.width || !outer.width || !outer.height) return;
    var x = (glyph.left - outer.left) * width / outer.width;
    clockMaskCanvas.width = width * 3;
    clockMaskCanvas.height = height * 3;
    var ctx = clockMaskCtx;
    ctx.scale(3, 3);
    ctx.font = css.fontWeight + " " + css.fontSize + " " + css.fontFamily;
    ctx.textBaseline = "alphabetic";
    var spacing = parseFloat(css.letterSpacing) || 0;
    var metrics = ctx.measureText(label);
    var baseline = height / 2 + ((metrics.actualBoundingBoxAscent || parseFloat(css.fontSize) * .72) -
      (metrics.actualBoundingBoxDescent || 0)) / 2;
    function paint(method) {
      if ("letterSpacing" in ctx) {
        ctx.letterSpacing = spacing + "px";
        ctx[method](label, x, baseline);
      } else {
        var cursor = x;
        for (var i = 0; i < label.length; i++) {
          ctx[method](label[i], cursor, baseline);
          cursor += ctx.measureText(label[i]).width + spacing;
        }
      }
    }
    paint("fillText");
    clockFace.style.setProperty("--clock-mask", "url(" + clockMaskCanvas.toDataURL() + ")");
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    paint("strokeText");
    clockFace.style.setProperty("--clock-edge-mask", "url(" + clockMaskCanvas.toDataURL() + ")");
    clockFace.setAttribute("data-glass-clock", "");
    maskKey = key;
  }

  var colorPicker = byId("lockCustomColor");
  var swatches = byId("lockColors").querySelectorAll("button[data-color]");
  function setLockColor(value, persist) {
    var color = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#ffffff";
    clockLayer.style.setProperty("--lock-ink", color);
    colorPicker.value = color;
    Array.prototype.forEach.call(swatches, function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-color") === color));
    });
    if (persist) options.save({ color: color });
  }
  setLockColor(options.settings.color, false);
  byId("lockColors").addEventListener("click", function (event) {
    var selected = event.target.closest("button[data-color]");
    if (selected) setLockColor(selected.getAttribute("data-color"), true);
  });
  function chooseCustomColor() { setLockColor(colorPicker.value, true); }
  colorPicker.addEventListener("input", chooseCustomColor);
  colorPicker.addEventListener("change", chooseCustomColor);
  var tuner = byId("clockTuning"), params = byId("clockGlassParams"), tuneStatus = byId("clockTuneStatus");
  var face = clockFace.querySelector(".clock-glass-face");
  var inputs = tuner.querySelectorAll("[data-clock-param]");
  var regionPicker = byId("clockTuneRegion");
  var regionValues = Object.assign({}, options.settings.glass);

  function restoreClockTuning(values) {
    Array.prototype.forEach.call(inputs, function (input) {
      var value = values[input.getAttribute("data-clock-param")];
      if (input.type === "checkbox") input.checked = value === true;
      else input.value = typeof value === "number" && isFinite(value) && value >= Number(input.min) && value <= Number(input.max) ? value :
        (regionPicker.value !== "clock" && input.getAttribute("data-clock-param") === "shadow" ? input.max : input.defaultValue);
    });
  }

  function paintClockGlass(values) {
    var vars = {
      "--blur-px": values.blurPx + "px",
      "--sat": values.saturation + "%",
      "--fill": values.fill,
      "--rim": .12 + values.edge * .4,
      "--rim-soft": .05 + values.edge * .2,
      "--edge-ring": .12 + values.edge * .7,
      "--sheen": values.sheen,
      "--clock-ink-opacity": values.inkOpacity
    };
    clockFace.style.setProperty("--clock-shadow", values.shadow);
    Object.keys(vars).forEach(function (key) { face.style.setProperty(key, vars[key]); });
  }

  function paintSmallShadows() {
    ["caption", "companion", "battery"].forEach(function (region) {
      var value = regionValues[region] && regionValues[region].shadow;
      var shadow = typeof value === "number" && isFinite(value) ? Math.max(0, Math.min(.5, value)) : .5;
      clockLayer.style.setProperty("--" + region + "-shadow", shadow);
    });
  }

  function applyClockTuning(persist) {
    var region = regionPicker.value;
    var values = {};
    Array.prototype.forEach.call(inputs, function (input) {
      var key = input.getAttribute("data-clock-param");
      if (region !== "clock" && key !== "shadow") return;
      if (input.type === "checkbox") values[key] = input.checked;
      else {
        values[key] = Number(input.value);
        tuner.querySelector('[data-clock-value="' + key + '"]').value = input.value;
      }
    });
    if (region === "clock") {
      values.blurPx = Math.round(((values.overLight ? 12 : 4) + values.blurAmount * 32) * 100) / 100;
      paintClockGlass(values);
    }
    regionValues[region] = values;
    if (region !== "clock") paintSmallShadows();
    if (persist) options.save({ glass: Object.assign({}, regionValues) });
    params.value = JSON.stringify(Object.assign(region === "clock" ? {} : { region: region }, values, { color: colorPicker.value }), null, 2);
  }

  function selectTuningRegion() {
    var region = regionPicker.value;
    restoreClockTuning(regionValues[region] || {});
    Array.prototype.forEach.call(inputs, function (input) {
      input.closest("label").hidden = region !== "clock" && input.getAttribute("data-clock-param") !== "shadow";
    });
    tuneStatus.textContent = "";
    applyClockTuning(false);
  }

  function changeTuning(event) {
    if (!event.target.hasAttribute("data-clock-param")) return;
    tuneStatus.textContent = "";
    applyClockTuning(true);
  }

  selectTuningRegion();
  paintSmallShadows();
  regionPicker.addEventListener("change", selectTuningRegion);
  tuner.addEventListener("input", changeTuning);
  tuner.addEventListener("change", changeTuning);
  byId("lockColors").addEventListener("click", function () { applyClockTuning(false); });
  colorPicker.addEventListener("input", function () { applyClockTuning(false); });
  colorPicker.addEventListener("change", function () { applyClockTuning(false); });
  byId("clockTuneReset").onclick = function () {
    restoreClockTuning({});
    applyClockTuning(true);
    tuneStatus.textContent = "已恢复本区默认";
  };
  byId("clockTuneCopy").onclick = function () {
    function selectParameters() {
      params.focus();
      params.select();
      tuneStatus.textContent = "已选中参数，可以手动复制。";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(params.value).then(function () {
        tuneStatus.textContent = "已复制当前参数";
      }, selectParameters);
    } else selectParameters();
  };


  var appCells = [];
  function icon(target, item, label) {
    var cell = document.createElement("div");
    cell.className = "app";
    var image = document.createElement("img");
    image.src = item[1];
    image.alt = "";
    cell.appendChild(image);
    if (label) cell.appendChild(document.createTextNode(item[0]));
    target.appendChild(cell);
    if (label) {
      appCells.push(iconCell(cell, appCells.length, 4));
    }
  }
  if (options.fixture) {
    options.fixture.icons.forEach(function (item) { icon(apps,item,true); });
    [0,1,10,11].forEach(function (index) { icon(dock,options.fixture.icons[index],false); });
    byId("backArt").querySelector("img").src = options.fixture.back;
    byId("frontArt").querySelector("img").src = options.fixture.front;
    byId("notice").querySelector("img").src = options.fixture.avatar;
    byId("cover").style.backgroundImage = imageStyle(options.fixture.cover);
  }
  var playing = false, seconds = 0;
  function showPlayer() {
    var button = byId("playerToggle");
    button.setAttribute("aria-label", playing ? "暂停示例" : "播放示例");
    byId("playShape").setAttribute("d",playing ? "M5 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1m10 0h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1" : "M6 3.7c0-1 1.1-1.6 2-1.1l13 8.3a1.3 1.3 0 0 1 0 2.2L8 21.4c-.9.5-2-.1-2-1.1z");
    function minutes(value) { return Math.floor(value/60) + ":" + ("0"+value%60).slice(-2); }
    byId("elapsed").textContent=minutes(seconds);
    byId("remaining").textContent="−"+minutes(177-seconds);
    byId("played").style.width=(seconds/177)*100+"%";
  }
  byId("playerToggle").onclick=function () { if (mode === "lock") { playing=!playing;showPlayer(); } };

  var lastClockMinute;
  function time() {
    var now = options.fixture ? options.fixture.now : new Date();
    var minute = Math.floor(now.getTime() / 60000);
    if (minute === lastClockMinute) return false;
    lastClockMinute = minute;
    var label = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    if (clockLabel.nodeValue !== label) clockLabel.nodeValue = label;
    updateClockMask();
    byId("statusTime").textContent = label;
    byId("date").textContent = (now.getMonth()+1) + "月" + now.getDate() + "日  周" + "日一二三四五六"[now.getDay()];
    return true;
  }
  time();
  var companionMode = byId("companionMode");
  function updateCompanionRing() {
    var mode = companionMode.value;
    var now = options.fixture ? options.fixture.now : new Date();
    var hour = now.getHours();
    var value = 100 - (hour*60 + now.getMinutes())/14.4;
    var night = hour < 6 || hour >= 18;
    if (mode === "music") value = seconds/177*100;
    if (mode === "moon") value = 74;
    var ring = byId("companionRing");
    ring.setAttribute("role",mode === "moon" ? "img" : "meter");
    if (mode === "moon") ring.removeAttribute("aria-valuenow");
    else ring.setAttribute("aria-valuenow",Math.round(value));
    ring.setAttribute("aria-label",mode === "day" ? "今天剩余时间" : companionMode.options[companionMode.selectedIndex].text);
    byId("companionSun").style.display = mode === "day" && !night ? "" : "none";
    byId("companionMoon").style.display = mode === "moon" || (mode === "day" && night) ? "" : "none";
    byId("companionMusic").style.display = mode === "music" ? "" : "none";
    byId("companionArc").setAttribute("stroke-dasharray",value+" 100");
    byId("companionArc").style.visibility=value > 0 ? "visible" : "hidden";
  }
  companionMode.onchange=updateCompanionRing;
  updateCompanionRing();
  var timer = setInterval(function () {
    var minuteChanged = time();
    if (playing) { seconds=(seconds+1)%178; showPlayer(); }
    if (minuteChanged || (playing && companionMode.value === "music")) updateCompanionRing();
  },1000);

  var lightWash = byId("lightWash");
  var disposed = false, batteryInfo, batteryListener;
  var battery = !options.fixture && navigator.getBattery ? navigator.getBattery() : null;
  if (battery) battery.then(function (info) {
    function updateBattery() {
      var level = Math.round(info.level*100);
      byId("batteryArc").setAttribute("stroke-dasharray", level + " 100");
      byId("batteryDetails").setAttribute("aria-valuenow", level);
      byId("batteryDetails").setAttribute("aria-label", "设备电量");
    }
    if (disposed) return;
    batteryInfo = info;
    batteryListener = updateBattery;
    updateBattery();
    info.addEventListener("levelchange",updateBattery);
  }).catch(function () {});
  byId("widgetText").oninput=function () { byId("bottomText").textContent=this.value.trim(); options.save({ caption: this.value }); };
  byId("weatherText").oninput=function () { byId("lockWeather").textContent=this.value.trim(); options.save({ weather: this.value }); };

  function prepareWakeWallpaper(image) {
    var width = phone.clientWidth, height = phone.clientHeight;
    if (!width || !height || !image.naturalWidth || !image.naturalHeight) return;
    var scale = Math.min(1, 720 / Math.max(width, height));
    var position = Number(byId("position").value) / 100;
    var layers = [5, 10].map(function (radius) {
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      var ctx = canvas.getContext("2d");
      if (!ctx || !("filter" in ctx)) return null;
      var fit = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      var w = image.naturalWidth * fit, h = image.naturalHeight * fit;
      ctx.fillStyle = "#202a36";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "blur(" + radius * scale + "px)";
      if (ctx.filter === "none") return null;
      ctx.drawImage(image, (canvas.width - w) * .5, (canvas.height - h) * position, w, h);
      canvas.style.opacity = "0";
      return canvas;
    });
    if (layers.some(function (layer) { return !layer; })) return;
    wakeWallpaper.textContent = "";
    wakeLayers = layers;
    layers.forEach(function (layer) { wakeWallpaper.appendChild(layer); });
    lastReveal = undefined;
    draw(progress, desktopProgress);
  }

  function draw(value, iconProgress) {
    progress = clamp(value);
    desktopProgress = iconProgress === undefined ? unlockIconProgress(progress) : iconProgress;
    if (lastReveal !== reveal) {
      lightWash.style.opacity = (1-reveal)*.72;
      var blur = reveal < 1 ? "blur(" + (1-reveal)*10 + "px)" : "none";
      lockWallpaper.style.filter = wakeLayers.length ? "none" : blur;
      if (!backArt.hidden) backArt.style.filter = blur;
      if (!frontArt.hidden) frontArt.style.filter = blur;
      phone.style.setProperty("--clock-softness", (.35 + (1-reveal)*4)+"px");
      phone.style.setProperty("--widget-softness", (.25 + (1-reveal)*3)+"px");
      var scale = "scale(" + (1+.045*(1-reveal)) + ")";
      lockWallpaper.style.transform = wakeWallpaper.style.transform = scale;
      if (wakeLayers.length) {
        var softness = (1 - reveal) * 2;
        wakeLayers[0].style.opacity = clamp(softness);
        wakeLayers[1].style.opacity = clamp(softness - 1);
        wakeWallpaper.hidden = reveal === 1;
      }
      lastReveal = reveal;
    }
    var distance = progress * screenHeight;
    var clockAlpha = 1 - clamp((progress - .06) / .29);
    var glassAlpha = 1 - clamp((progress - .16) / .36);
    var moving = ease(clamp(progress / .56));
    clockLayer.style.transform = "translate3d(0," + (-distance * 1.12 + (1-reveal)*7) + "px,0) scale(" + (1 - .045*moving) + ")";
    clockLayer.style.setProperty("--clock-alpha", clockAlpha * reveal);
    var glassLift = distance*.64 + (1-reveal)*12;
    lockControls.style.transform = glassLift ? "translate3d(0," + -glassLift + "px,0)" : "none";
    lockControls.style.setProperty("--glass-alpha", glassAlpha * reveal);
    lockControls.style.visibility = glassAlpha === 0 ? "hidden" : "visible";
    handle.style.transform = "translate3d(0," + (-distance*.60) + "px,0)";
    handle.style.opacity = glassAlpha * clamp((reveal - .23) / .77);
    if (lastProgress !== progress) {
      var fade = ease(clamp((progress - .08) / .69));
      var handoff = ease(clamp((progress - .52) / .48));
      if (live) {
        var departure = paintingPair ? handoff : fade;
        lockWallpaper.style.opacity = wakeWallpaper.style.opacity = backArt.style.opacity =
          frontArt.style.opacity = 1 - departure;
      } else {
        homeWallpaperLayer.style.opacity = paintingPair ? 0 : fade;
        frontArt.style.opacity = paintingPair ? 1 - handoff : 1 - fade;
      }
      for (var i = 0; i < shades.length; i++) shades[i].style.opacity = 1 - handoff;
      lastProgress = progress;
    }
    if (lastIcons !== desktopProgress) {
      drawDesktop(desktopProgress, appCells, dock, homebar);
      if (options.desktop) options.desktop.draw(desktopProgress);
      lastIcons = desktopProgress;
    }
    lockMark.style.opacity = clockAlpha * reveal;
  }

  function stopMotion() { cancelAnimationFrame(frame); frame = 0; }
  function stopDrag() {
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
  }
  function paintDrag() {
    dragFrame = 0;
    draw(queuedProgress, queuedIcons);
  }
  function settled(unlocked) {
    mode = unlocked ? "home" : "lock";
    zone.hidden = unlocked;
    home.setAttribute("aria-hidden", String(!unlocked));
    block(byId("homeTools"),options.editor && unlocked);
    byId("playerToggle").tabIndex = unlocked ? -1 : 0;
    byId("statusTime").style.visibility = unlocked ? "visible" : "hidden";
    byId("screenStatus").textContent = unlocked ? "已解锁，桌面" : "锁屏";
  }
  function finish(unlock, velocity) {
    stopMotion();
    stopDrag();
    var from = progress;
    var iconStart = desktopProgress;
    var target = unlock ? 1 : 0;
    var duration = unlock ? unlockReleaseDuration(from, velocity) : 245;
    if (unlock && reveal < 1) {
      cancelAnimationFrame(wakeFrame);
      wakeFrame = 0;
      reveal = 1;
      draw(from, iconStart);
    }
    mode = "settling";
    settlingTarget = target;
    function done() {
      frame = 0;
      draw(target, target);
      settled(unlock);
      if (unlock) {
        if (options.desktop) options.desktop.finish();
        if (!options.editor) phone.hidden = true;
        options.unlock();
        options.requestPermission();
      }
    }
    if ((from === target && iconStart === target) || (reducedMotion && reducedMotion.matches)) { done(); return; }
    var previous = performance.now();
    var elapsed = 0;
    function tick(now) {
      elapsed += unlockFrameSeconds(previous, now) * 1000;
      previous = now;
      if (elapsed >= duration) {
        done();
      } else {
        var next = unlockReleaseFrame(from, iconStart, unlock, elapsed / duration);
        draw(next.progress, next.icons);
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);
  }

  function startReveal() {
    if (reveal === 1 || wakeFrame) return;
    if (reducedMotion && reducedMotion.matches) { reveal = 1; draw(progress); return; }
    var previous = performance.now();
    var elapsed = 0;
    function tick(now) {
      elapsed += unlockFrameSeconds(previous, now) * 1000;
      previous = now;
      reveal = ease(clamp(elapsed / 650));
      wakeFrame = reveal < 1 ? requestAnimationFrame(tick) : 0;
      draw(progress, desktopProgress);
    }
    wakeFrame = requestAnimationFrame(tick);
  }
  function startLock(play, hold) {
    gesture = null;
    stopMotion();
    stopDrag();
    cancelAnimationFrame(wakeFrame);
    wakeFrame = 0;
    screenHeight = phone.clientHeight;
    settled(false);
    reveal = play ? 0 : 1;
    draw(0);
    if (play && !hold) startReveal();
  }
  function gestureStart(id, x, y) {
    if (mode === "home" || gesture || (options.holdReveal && !wakeFrame && reveal === 0)) return false;
    var interruptedTarget = mode === "settling" ? settlingTarget : undefined;
    stopMotion();
    if (reveal < 1) {
      cancelAnimationFrame(wakeFrame);
      wakeFrame = 0;
      reveal = 1;
      draw(progress, desktopProgress);
    }
    screenHeight = phone.clientHeight;
    mode = "drag";
    queuedProgress = progress;
    queuedIcons = desktopProgress;
    gesture = {id:id,x:x,y:y,base:progress,icons:desktopProgress,crossed:false,interruptedTarget:interruptedTarget,samples:[{y:y,at:performance.now()}]};
    return true;
  }
  function gestureMove(id,x,y) {
    if (!gesture || gesture.id !== id) return false;
    var delta = gesture.y - y;
    if (!gesture.crossed) {
      var travel = gesture.base > 0 ? Math.abs(delta) : delta;
      if (travel < 4 || travel < Math.abs(x-gesture.x)*.72) return false;
      gesture.crossed = true;
    }
    var now = performance.now();
    var samples = gesture.samples;
    samples.push({y:y,at:now});
    while (samples.length > 1 && samples[0].at < now-110) samples.shift();
    queuedProgress = clamp(gesture.base + delta / Math.max(1, screenHeight));
    queuedIcons = clamp(gesture.icons + unlockIconProgress(queuedProgress) - unlockIconProgress(gesture.base));
    if (!dragFrame) dragFrame = requestAnimationFrame(paintDrag);
    return true;
  }
  function gestureEnd(id,x,y,cancel) {
    if (!gesture || gesture.id !== id) return;
    var movement = gesture;
    if (!cancel) gestureMove(id,x,y);
    stopDrag();
    if (!cancel && movement.crossed) {
      draw(queuedProgress, queuedIcons);
    }
    gesture = null;
    var now = performance.now(), sample = movement.samples[0];
    var velocity = cancel ? 0 : (sample.y-y)/Math.max(16,now-sample.at);
    var flick = movement.y-y >= 38 && now-sample.at <= 145 && velocity >= .54;
    var reverseFlick = movement.y-y <= -38 && velocity <= -.54;
    var unlock = !cancel && (movement.crossed
      ? !reverseFlick && (progress >= .25 || flick)
      : movement.interruptedTarget === 1);
    finish(unlock,velocity);
  }
  if (window.PointerEvent) {
    phone.addEventListener("pointerdown",function (event) {
      if (!event.isPrimary || event.button !== 0 || event.target.closest("#panelOpen, #playerToggle, #relock")) return;
      if (gestureStart(event.pointerId,event.clientX,event.clientY)) {
        event.preventDefault();
        phone.setPointerCapture(event.pointerId);
      }
    });
    phone.addEventListener("pointermove",function (event) { gestureMove(event.pointerId,event.clientX,event.clientY); });
    phone.addEventListener("pointerup",function (event) { gestureEnd(event.pointerId,event.clientX,event.clientY,false); });
    phone.addEventListener("pointercancel",function (event) { gestureEnd(event.pointerId,0,0,true); });
    phone.addEventListener("lostpointercapture",function (event) { gestureEnd(event.pointerId,0,0,true); });
  } else {
    phone.addEventListener("touchstart",function (event) {
      if (event.target.closest("#panelOpen, #playerToggle, #relock")) return; var touch=event.changedTouches[0];
      if (gestureStart(touch.identifier,touch.clientX,touch.clientY)) event.preventDefault();
    },{passive:false});
    phone.addEventListener("touchmove",function (event) {
      if (event.target.closest("#panelOpen, #playerToggle, #relock")) return; var touch=event.changedTouches[0];
      if (gestureMove(touch.identifier,touch.clientX,touch.clientY)) event.preventDefault();
    },{passive:false});
    phone.addEventListener("touchend",function (event) {
      if (event.target.closest("#panelOpen, #playerToggle, #relock")) return; var touch=event.changedTouches[0];
      gestureEnd(touch.identifier,touch.clientX,touch.clientY,false);
    });
    phone.addEventListener("touchcancel",function (event) { gestureEnd(event.changedTouches[0].identifier,0,0,true); });
  }
  zone.addEventListener("keydown",function (event) {
    if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (mode === "lock") finish(true,0);
    }
  });
  function setPanel(open) {
    panel.classList.toggle("open",open);
    byId("panelOpen").setAttribute("aria-expanded", String(open));
  }
  byId("panelOpen").onclick = function () { setPanel(!panel.classList.contains("open")); };
  byId("panelClose").onclick = function () { setPanel(false); byId("panelOpen").focus(); };
  if (options.editor) byId("relock").onclick = function () { startLock(true); };
  byId("replay").onclick = function () { setPanel(false); startLock(true); };
  byId("refreshView").onclick = function () { setPanel(false); startLock(false); };
  function applyWallpaper() {
    paintingPair = sample || pair.checked;
    lockWallpaper.classList.toggle("custom",!!lockImage);
    homeWallpaper.classList.toggle("custom",!!desktopImage);
    lockWallpaper.style.backgroundImage = imageStyle(lockImage);
    homeWallpaper.style.backgroundImage = imageStyle(desktopImage);
    var pos = (sample ? 50 : byId("position").value) + "%";
    lockWallpaper.style.backgroundPosition = "50% " + pos;
    frontArt.style.backgroundPosition = "50% " + pos;
    frontArt.classList.toggle("wallpaper",!!lockImage && !!frontImage);
    frontArt.classList.toggle("custom",!!lockImage && !!frontImage);
    frontArt.style.backgroundColor = "transparent";
    frontArt.style.backgroundImage = lockImage && frontImage ? 'url("' + frontImage + '")' : "";
    var showSampleArt = !lockImage && !!options.fixture;
    var showDepth = !sample && depth.checked && (showSampleArt || !!frontImage);
    block(frontArt,showDepth);
    block(frontArt.querySelector("img"),showSampleArt);
    block(backArt,showSampleArt && !showDepth);
    block(byId("foregroundRow"),depth.checked && !showSampleArt);
    block(byId("reset"),!options.editor);
    byId("imageNote").textContent = depth.checked && lockImage && !frontImage ? "选一张和壁纸同尺寸的透明前景图，就能盖住钟面的一角。" : "";
    lastReveal = undefined;
    lastProgress = undefined;
    draw(progress, desktopProgress);
  }
  byId("showNotice").onchange=function () {
    var notice = byId("notice");
    block(notice,this.checked);
    notice.classList.toggle("notice-arriving",this.checked);
    lockControls.classList.toggle("has-notice",this.checked);
    draw(progress, desktopProgress);
  };

  var settings = options.settings;
  var sample = false;
  var wallpapers = options.wallpapers;
  function imageStyle(value) {
    if (!value) return "";
    return /^(linear|radial|conic)-gradient\(/.test(value) ? value : "url(" + JSON.stringify(value) + ")";
  }
  function setWallpapers(values) {
    wallpapers = values;
    var nextLockImage = sample ? "" : values.lock;
    if (lockImage !== nextLockImage) {
      wakeLayers = [];
      wakeWallpaper.textContent = "";
      wakeWallpaper.hidden = true;
    }
    lockImage = nextLockImage;
    desktopImage = sample ? "" : values.home;
    frontImage = sample ? "" : values.front;
    applyWallpaper();
  }
  function bindValue(id, field, read, paint, event) {
    var input = byId(id);
    if (input.type === "checkbox") input.checked = settings[field];
    else input.value = settings[field];
    if (paint) paint(input);
    input.addEventListener(event || "input", function () {
      if (paint) paint(input);
      options.save({ [field]: read(input) });
    });
  }
  bindValue("pair", "pair", function (input) { return input.checked; }, null, "change");
  bindValue("depth", "depth", function (input) { return input.checked; }, null, "change");
  bindValue("position", "position", function (input) { return Number(input.value); });
  pair.addEventListener("change", applyWallpaper);
  depth.addEventListener("change", applyWallpaper);
  byId("position").addEventListener("input", applyWallpaper);
  bindValue("clockPosition", "clockPosition", function (input) { return Number(input.value); }, function (input) {
    byId("clock").style.setProperty("--clock-top", input.value + "%");
  });
  bindValue("clockSize", "clockSize", function (input) { return Number(input.value); }, function (input) {
    clockFace.style.setProperty("--clock-scale", Number(input.value) / 100);
  });
  byId("widgetText").value = settings.caption;
  byId("bottomText").textContent = settings.caption.trim();
  byId("weatherText").value = settings.weather;
  byId("lockWeather").textContent = settings.weather.trim();
  bindValue("companionMode", "ring", function (input) { return input.value; }, updateCompanionRing, "change");

  var pendingImage = false;
  if (options.editor) {
    [["pickLock", "lock"], ["pickHome", "home"], ["pickFront", "front"]].forEach(function (entry) {
      var input = byId(entry[0]);
      input.addEventListener("change", async function () {
        var file = input.files[0];
        input.value = "";
        if (!file || pendingImage) return;
        var url = URL.createObjectURL(file);
        pendingImage = true;
        var image = new Image();
        try {
          await new Promise(function (resolve, reject) {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
          });
          if (disposed) return;
          await options.saveImage(entry[1], file);
          if (disposed) return;
          sample = false;
          byId("reset").textContent = "恢复示例壁纸";
          if (entry[1] === "home") pair.checked = false;
          setWallpapers(wallpapers);
        } catch (error) {
          if (!disposed) byId("imageNote").textContent = "图片读取或保存失败，请试试 JPG、PNG 或 WebP。";
        } finally {
          URL.revokeObjectURL(url);
          pendingImage = false;
        }
      });
    });
  }
  byId("reset").onclick = function () {
    sample = !sample;
    setWallpapers(wallpapers);
    byId("reset").textContent = sample ? "查看当前壁纸" : "恢复示例壁纸";
  };
  function resize() {
    if (gesture) gestureEnd(gesture.id,0,0,true);
    screenHeight = phone.clientHeight;
    if (wakeLayers.length) {
      wakeLayers = [];
      wakeWallpaper.textContent = "";
      wakeWallpaper.hidden = true;
      lastReveal = undefined;
    }
    updateClockMask();
    draw(progress, desktopProgress);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("pageshow", time);
  if (document.fonts) document.fonts.ready.then(function () {
    if (!disposed) {
      if (maskReady) maskKey = "";
      maskReady = true;
      updateClockMask();
    }
  });
  if (options.fixture) {
    byId("batteryArc").setAttribute("stroke-dasharray", options.fixture.battery + " 100");
    byId("batteryDetails").setAttribute("aria-valuenow", options.fixture.battery);
    seconds = options.fixture.seconds;
    showPlayer();
    updateCompanionRing();
  }
  if (!options.editor) {
    panel.hidden = true;
    byId("panelOpen").hidden = true;
    byId("homeContent").hidden = true;
  }
  setWallpapers(wallpapers);
  startLock(options.reveal, options.holdReveal);
  if (options.editor && !options.fixture) setPanel(true);

  return {
    setWallpapers: setWallpapers,
    prepareClock: function () { maskReady = true; updateClockMask(); },
    prepareWakeWallpaper: prepareWakeWallpaper,
    startReveal: startReveal,
    draw: function (value) { reveal = 1; draw(value); },
    closePanel: function () {
      if (!panel.classList.contains("open")) return false;
      setPanel(false);
      byId("panelOpen").focus();
      return true;
    },
    dispose: function () {
      disposed = true;
      stopMotion();
      stopDrag();
      cancelAnimationFrame(wakeFrame);
      clearInterval(timer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pageshow", time);
      if (batteryInfo) batteryInfo.removeEventListener("levelchange", batteryListener);
      if (options.desktop) options.desktop.clear();
      root.textContent = "";
    }
  };
}
