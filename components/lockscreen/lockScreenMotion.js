import { CLOCK_GLASS_SLIDERS, LOCK_GLASS_REGIONS, glassSliderValue, isCardGlassRegion } from "./lockScreenSettings";
import { bindLockScreenMedia } from "./lockScreenMedia";
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
  var phone = byId("phone"), zone = byId("unlockZone");
  var frontArt = byId("frontArt"), lockWallpaper = byId("lockWallpaper");
  var wakeWallpaper = byId("wakeWallpaper"), wakeLayers = [];
  var clockLayer = byId("clockLayer"), lockControls = byId("lockControls"), handle = byId("handle");
  var shades = phone.querySelectorAll(".shade");
  var lockMark = byId("lockMark");
  var queuedProgress, queuedIcons, dragFrame = 0, wakeFrame = 0, lastReveal, lastProgress, settlingTarget;
  var desktopProgress = 0, lastIcons;
  var mode = "lock", progress = 0, frame = 0, gesture = null, reveal = 1, screenHeight = 1;
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var lockImage = "", frontImage = "", settings = options.settings;

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

  var face = clockFace.querySelector(".clock-glass-face");
  var cardSurfaces = { notice: byId("notice"), player: byId("player"), flashlight: byId("lockFlashlight"), camera: byId("lockCamera") };
  function paintGlass() {
    var values = Object.fromEntries(CLOCK_GLASS_SLIDERS.map(function (slider) {
      return [slider.key, glassSliderValue(settings.glass, "clock", slider)];
    }));
    var blur = (settings.glass.clock?.overLight === true ? 12 : 4) + values.blurAmount * 32;
    var vars = {
      "--blur-px": Math.round(blur * 100) / 100 + "px",
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
    var shadow = CLOCK_GLASS_SLIDERS.find(function (slider) { return slider.key === "shadow"; });
    LOCK_GLASS_REGIONS.filter(function (region) { return region.id !== "clock" && !isCardGlassRegion(region.id); }).forEach(function (region) {
      clockLayer.style.setProperty("--" + region.id + "-shadow", glassSliderValue(settings.glass, region.id, shadow));
    });
  }

  function paintCardGlass(previous) {
    Object.entries(cardSurfaces).forEach(function ([region, element]) {
      if (previous && settings.glass[region] === previous[region]) return;
      var values = Object.fromEntries(CLOCK_GLASS_SLIDERS.map(function (slider) {
        return [slider.key, glassSliderValue(settings.glass, region, slider)];
      }));
      var vars = {
        "--blur-px": Math.round((4 + values.blurAmount * 32) * 100) / 100 + "px",
        "--sat": values.saturation + "%",
        "--fill": values.fill,
        "--rim": .12 + values.edge * .4,
        "--rim-soft": .05 + values.edge * .2,
        "--edge-ring": .12 + values.edge * .7,
        "--sheen": values.sheen,
        "--shadow": values.shadow
      };
      Object.entries(vars).forEach(function ([key, value]) { element.style.setProperty(key, value); });
    });
  }

  var media = bindLockScreenMedia(root, {
    player: options.player,
    canUsePlayer: function () { return !options.editor && mode === "lock" && reveal > .12; },
    atRest: function () { return mode === "lock" && reveal === 1; },
    reducedMotion: function () { return !!reducedMotion?.matches; },
    openNotice: function (charId) { finish(true, 0, charId); },
    updateMusicRing: function () { if (settings.ring === "music") updateCompanionRing(); }
  });

  var lastClockMinute;
  function time() {
    var now = new Date();
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
  function updateCompanionRing() {
    var mode = settings.ring;
    var now = new Date();
    var hour = now.getHours();
    var value = 100 - (hour*60 + now.getMinutes())/14.4;
    var night = hour < 6 || hour >= 18;
    if (mode === "music") value = media.musicFraction() * 100;
    if (mode === "moon") value = 74;
    var ring = byId("companionRing");
    ring.setAttribute("role",mode === "moon" ? "img" : "meter");
    if (mode === "moon") ring.removeAttribute("aria-valuenow");
    else ring.setAttribute("aria-valuenow",Math.round(value));
    ring.setAttribute("aria-label",mode === "day" ? "今天剩余时间" : mode === "music" ? "当前歌曲进度" : "晚安小月亮");
    byId("companionSun").style.display = mode === "day" && !night ? "" : "none";
    byId("companionMoon").style.display = mode === "moon" || (mode === "day" && night) ? "" : "none";
    byId("companionMusic").style.display = mode === "music" ? "" : "none";
    byId("companionArc").setAttribute("stroke-dasharray",value+" 100");
    byId("companionArc").style.visibility=value > 0 ? "visible" : "hidden";
  }
  var timer = setInterval(function () {
    if (time() && settings.ring === "day") updateCompanionRing();
  }, 1000);

  var lightWash = byId("lightWash");
  var disposed = false, batteryInfo, batteryListener;
  var battery = navigator.getBattery ? navigator.getBattery() : null;
  if (battery) battery.then(function (info) {
    function updateBattery() {
      var level = Math.round(info.level*100);
      byId("batteryArc").setAttribute("stroke-dasharray", level + " 100");
      byId("batteryDetails").setAttribute("aria-valuenow", level);
      byId("batteryDetails").removeAttribute("aria-valuetext");
    }
    if (disposed) return;
    batteryInfo = info;
    batteryListener = updateBattery;
    updateBattery();
    info.addEventListener("levelchange",updateBattery);
  }).catch(function () {});
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
      var departure = settings.pair ? handoff : fade;
      lockWallpaper.style.opacity = wakeWallpaper.style.opacity = frontArt.style.opacity = 1 - departure;
      for (var i = 0; i < shades.length; i++) shades[i].style.opacity = 1 - handoff;
      lastProgress = progress;
    }
    if (lastIcons !== desktopProgress) {
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
    if (!unlocked) media.flushNotice();
    if (!unlocked) media.setMoving(false);
    byId("statusTime").style.visibility = unlocked ? "visible" : "hidden";
  }
  function finish(unlock, velocity, charId) {
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
    media.setMoving(true);
    settlingTarget = target;
    function done() {
      frame = 0;
      draw(target, target);
      settled(unlock);
      if (unlock) {
        if (options.desktop) options.desktop.finish();
        phone.hidden = true;
        options.unlock(charId);
        options.requestPermission();
      }
    }
    if ((from === target && iconStart === target) || (reducedMotion && reducedMotion.matches)) { done(); return; }
    var previous = performance.now();
    var deadline = previous + duration + 300;
    var elapsed = 0;
    function tick(now) {
      elapsed += unlockFrameSeconds(previous, now) * 1000;
      previous = now;
      if (elapsed >= duration || now >= deadline) {
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
    if (reducedMotion && reducedMotion.matches) { reveal = 1; draw(progress); media.flushNotice(); return; }
    var previous = performance.now();
    var elapsed = 0;
    function tick(now) {
      elapsed += unlockFrameSeconds(previous, now) * 1000;
      previous = now;
      reveal = ease(clamp(elapsed / 650));
      wakeFrame = reveal < 1 ? requestAnimationFrame(tick) : 0;
      draw(progress, desktopProgress);
      if (!wakeFrame) media.flushNotice();
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
    reveal = play ? 0 : 1;
    settled(false);
    draw(0);
    if (play && !hold) startReveal();
  }
  function gestureStart(id, x, y, fromNotice) {
    if (options.editor || mode === "home" || (mode === "settling" && settlingTarget === 1) || gesture || (options.holdReveal && !wakeFrame && reveal === 0)) return false;
    stopMotion();
    if (reveal < 1) {
      cancelAnimationFrame(wakeFrame);
      wakeFrame = 0;
      reveal = 1;
      draw(progress, desktopProgress);
    }
    screenHeight = phone.clientHeight;
    mode = "drag";
    media.setMoving(true);
    queuedProgress = progress;
    queuedIcons = desktopProgress;
    gesture = {id:id,x:x,y:y,base:progress,icons:desktopProgress,crossed:false,fromNotice:fromNotice,samples:[{y:y,at:performance.now()}]};
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
    if (!cancel && movement.fromNotice && !movement.crossed
      && Math.hypot(x - movement.x, y - movement.y) < 9 && media.noticeTarget()) {
      finish(true, 0, media.noticeTarget());
      return;
    }
    var unlock = !cancel && movement.crossed && !reverseFlick && (progress >= .25 || flick);
    finish(unlock,velocity);
  }
  if (window.PointerEvent) {
    phone.addEventListener("pointerdown",function (event) {
      if (!event.isPrimary || event.button !== 0 || event.target.closest("#player button, #playerSeek")) return;
      if (gestureStart(event.pointerId,event.clientX,event.clientY,!!event.target.closest("#notice"))) {
        event.preventDefault();
        try { phone.setPointerCapture(event.pointerId); }
        catch (error) { gestureEnd(event.pointerId,event.clientX,event.clientY,true); }
      }
    });
    phone.addEventListener("pointermove",function (event) {
      if (event.pointerType === "mouse" && event.buttons === 0) gestureEnd(event.pointerId,event.clientX,event.clientY,true);
      else gestureMove(event.pointerId,event.clientX,event.clientY);
    });
    phone.addEventListener("pointerup",function (event) { gestureEnd(event.pointerId,event.clientX,event.clientY,false); });
    phone.addEventListener("pointercancel",function (event) { gestureEnd(event.pointerId,0,0,true); });
    phone.addEventListener("lostpointercapture",function (event) { gestureEnd(event.pointerId,0,0,true); });
  } else {
    phone.addEventListener("touchstart",function (event) {
      if (event.target.closest("#player button, #playerSeek")) return; var touch=event.changedTouches[0];
      if (gestureStart(touch.identifier,touch.clientX,touch.clientY,!!event.target.closest("#notice"))) event.preventDefault();
    },{passive:false});
    phone.addEventListener("touchmove",function (event) {
      if (event.target.closest("#player button, #playerSeek")) return; var touch=event.changedTouches[0];
      if (gestureMove(touch.identifier,touch.clientX,touch.clientY)) event.preventDefault();
    },{passive:false});
    phone.addEventListener("touchend",function (event) {
      if (event.target.closest("#player button, #playerSeek")) return; var touch=event.changedTouches[0];
      gestureEnd(touch.identifier,touch.clientX,touch.clientY,false);
    });
    phone.addEventListener("touchcancel",function (event) { gestureEnd(event.changedTouches[0].identifier,0,0,true); });
  }
  zone.addEventListener("keydown",function (event) {
    if (options.editor) return;
    if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (mode === "lock") finish(true,0);
    }
  });
  function imageStyle(value) {
    if (!value) return "";
    return /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(value) ? value : "url(" + JSON.stringify(value) + ")";
  }
  function applyWallpaper() {
    lockWallpaper.classList.toggle("custom", !!lockImage);
    lockWallpaper.style.backgroundImage = imageStyle(lockImage);
    var pos = "50% " + settings.position + "%";
    lockWallpaper.style.backgroundPosition = frontArt.style.backgroundPosition = pos;
    frontArt.classList.toggle("wallpaper", !!frontImage);
    frontArt.classList.toggle("custom", !!frontImage);
    frontArt.style.backgroundColor = "transparent";
    frontArt.style.backgroundImage = imageStyle(frontImage);
    block(frontArt, !!lockImage && !!frontImage && settings.depth);
    lastReveal = undefined;
    lastProgress = undefined;
    draw(progress, desktopProgress);
  }
  function setWallpapers(values) {
    if (lockImage !== values.lock) {
      wakeLayers = [];
      wakeWallpaper.textContent = "";
      wakeWallpaper.hidden = true;
    }
    lockImage = values.lock;
    frontImage = values.front;
    applyWallpaper();
  }
  function setSettings(next) {
    var previous = settings;
    settings = next;
    if (next.color !== previous.color || next === previous) clockLayer.style.setProperty("--lock-ink", next.color);
    if (next.glass !== previous.glass || next === previous) {
      paintGlass();
      paintCardGlass(next === previous ? null : previous.glass);
    }
    if (next.clockPosition !== previous.clockPosition || next === previous) byId("clock").style.setProperty("--clock-top", next.clockPosition + "%");
    if (next.clockSize !== previous.clockSize || next === previous) clockFace.style.setProperty("--clock-scale", next.clockSize / 100);
    byId("bottomText").textContent = next.caption.trim();
    paintWeather();
    if (next.ring !== previous.ring || next === previous) updateCompanionRing();
    if (next.position !== previous.position || next.depth !== previous.depth || next.pair !== previous.pair) applyWallpaper();
  }

  var liveWeather = "";
  function paintWeather() {
    var weather = byId("lockWeather");
    weather.textContent = liveWeather || settings.weather.trim();
    weather.hidden = !weather.textContent;
  }
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
  if (options.editor) phone.inert = true;
  setSettings(settings);
  setWallpapers(options.wallpapers);
  startLock(options.reveal, options.holdReveal);

  return {
    setWallpapers: setWallpapers,
    setSettings: setSettings,
    setPlayer: media.setPlayer,
    setNotice: media.setNotice,
    setWeather: function (value) { liveWeather = value; paintWeather(); },
    prepareClock: function () { maskReady = true; updateClockMask(); },
    prepareWakeWallpaper: prepareWakeWallpaper,
    startReveal: startReveal,
    draw: function (value) { reveal = 1; draw(value); },
    dispose: function () {
      disposed = true;
      media.dispose();
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
