import { normalizeAudioPath } from "../core/types";
import { BaseTheme } from "./base";

export class IMessageTheme extends BaseTheme {
  get id() { return "imessage"; }
  get label() { return "iMessage"; }

  // protected get bottomBandBg() { return "#007aff"; }
  // protected get bottomBandFg() { return "#fff"; }

  render(): string {
    return this.wrapHTML(this.css, this.html, this.js);
  }

  /** Chrome colors for the current color scheme (light default, dark variant). */
  private get palette() {
    if (this.isDark) {
      return {
        deviceBg: "#000",
        headerBg: "#1c1c1e",
        headerBorder: "#38383a",
        titleFg: "#fff",
        subtitleFg: "#8e8e93",
        bodyBg: "#000",
        sectionDividerFg: "#8e8e93",
        leftBubbleBg: "#26262a",
        leftBubbleFg: "#fff",
        senderLabelFg: "#8e8e93",
        timeStampFg: "#8e8e93",
        footerBg: "#1c1c1e",
        footerBorder: "#38383a",
        inputBg: "#1c1c1e",
        inputBorder: "#38383a",
        inputFg: "#8e8e93",
      };
    }
    return {
      deviceBg: "#fff",
      headerBg: "#f6f6f6",
      headerBorder: "#c8c8c8",
      titleFg: "#000",
      subtitleFg: "#8e8e93",
      bodyBg: "#fff",
      sectionDividerFg: "#8e8e93",
      leftBubbleBg: "#e9e9eb",
      leftBubbleFg: "#000",
      senderLabelFg: "#8e8e93",
      timeStampFg: "#8e8e93",
      footerBg: "#f6f6f6",
      footerBorder: "#c8c8c8",
      inputBg: "#fff",
      inputBorder: "#c8c8c8",
      inputFg: "#999",
    };
  }

  private get css(): string {
    const p = this.palette;
    return `
.device {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: ${p.deviceBg};
}

.im-header {
  background: ${p.headerBg}; border-bottom: 0.5px solid ${p.headerBorder};
  padding: 19px 22px 14px; text-align: center; flex-shrink: 0;
}
.im-header .title { font-size: 20px; font-weight: 600; color: ${p.titleFg}; }
.im-header .subtitle { font-size: 15px; color: ${p.subtitleFg}; }

.im-body {
  flex: 1; overflow-y: auto; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 8px;
  scroll-behavior: smooth; background: ${p.bodyBg};
}

.section-divider { text-align: center; margin: 11px 0; }
.section-divider span {
  font-size: 14px; color: ${p.sectionDividerFg}; font-weight: 500;
}

.msg-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 3px; }
.msg-row.right { flex-direction: row-reverse; }

.avatar-col { width: 40px; flex-shrink: 0; }
.avatar {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
  font-size: 16px; font-weight: 600;
}
.avatar-letter { position: relative; z-index: 1; }
.avatar-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  display: block;
}

.msg-col { display: flex; flex-direction: column; max-width: 70%; }
.msg-col.right { align-items: flex-end; }

.sender-label {
  font-size: 14px; color: ${p.senderLabelFg};
  margin-bottom: 3px; padding-left: 5px;
}
.sender-label.right { padding-left: 0; padding-right: 5px; }

.bubble-wrap { display: flex; align-items: flex-end; gap: 6px; }
.bubble-wrap.right { flex-direction: row-reverse; }

.bubble {
  padding: 11px 16px;
  font-size: 19px; line-height: 1.45;
  word-break: break-word;
}
.bubble.right {
  background: #007aff; color: #fff;
  border-radius: 24px 0 24px 24px;
}
.bubble.left {
  background: ${p.leftBubbleBg}; color: ${p.leftBubbleFg};
  border-radius: 0 24px 24px 24px;
}
.bubble.pop { animation: popIn 0.18s ease-out; }

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}

.time-stamp { font-size: 12px; color: ${p.timeStampFg}; white-space: nowrap; margin-bottom: 2px; }

.bubble-img {
  max-width: 100%; max-height: 280px; width: auto; display: block;
  border-radius: 19px; overflow: hidden; object-fit: cover;
  margin-bottom: 6px;
}
.bubble-img.right { border-radius: 24px 0 24px 24px; }
.bubble-img.left  { border-radius: 0 24px 24px 24px; }

.im-footer {
  border-top: 0.5px solid ${p.footerBorder}; padding: 11px 16px;
  display: flex; align-items: center; gap: 11px; flex-shrink: 0;
  background: ${p.footerBg};
}
.im-input {
  flex: 1; border: 0.5px solid ${p.inputBorder}; border-radius: 24px;
  padding: 10px 18px; font-size: 18px; color: ${p.inputFg}; background: ${p.inputBg};
}
.im-send {
  width: 40px; height: 40px; background: #007aff; border-radius: 50%;
  border: none; display: flex; align-items: center; justify-content: center;
}
.im-send svg { fill: #fff; }`;
  }

  private get html(): string {
    const ep = this.episode;
    return `
<div class="device">
  <div class="im-header">
    <div class="title">${ep.episode_title ? ep.episode_title : ep.name ? ep.name + ' ' + 'EP.' + ep.episode_number : ''}</div>
    <div class="subtitle">${this.hostCount} people</div>
  </div>
  <div class="im-body" id="chat-body">
    <div class="section-divider"><span>${this.firstSection}</span></div>
  </div>
  <div class="im-footer">
    <div class="im-input">iMessage</div>
    <div class="im-send">
      <svg width="19" height="19" viewBox="0 0 14 14">
        <path d="M7 1L13 13H1L7 1Z"/>
      </svg>
    </div>
  </div>
</div>`;
  }

  private get hostMapJSON(): string {
    const colors = ["#007aff", "#e9e9eb", "#34c759", "#ff9500", "#af52de"];
    const textColors = ["#fff", "#555", "#fff", "#fff", "#fff"];
    const bubbleBgs = this.isDark
      ? ["#007aff", "#26262a", "#34c759", "#ff9500", "#af52de"]
      : ["#007aff", "#e9e9eb", "#34c759", "#ff9500", "#af52de"];
    const bubbleFgs = this.isDark
      ? ["#fff", "#fff", "#fff", "#fff", "#fff"]
      : ["#fff", "#000", "#fff", "#fff", "#fff"];
    const map: Record<string, { letter: string; bg: string; fg: string; image: string; bubbleBg: string; bubbleFg: string }> = {};
    this.episode.hosts.forEach((h, i) => {
      map[h.id] = {
        letter: h.name.charAt(0),
        bg: colors[i % colors.length],
        fg: textColors[i % textColors.length],
        image: h.image ? normalizeAudioPath(h.image) : "",
        bubbleBg: bubbleBgs[i % bubbleBgs.length],
        bubbleFg: bubbleFgs[i % bubbleFgs.length],
      };
    });
    return JSON.stringify(map);
  }

  private get js(): string {
    return `
const body = document.getElementById('chat-body');
const ME = ${JSON.stringify(this.meHostId)};
const SHOW_AVATAR = ${this.showAvatar};
const HOST_MAP = ${this.hostMapJSON};

var _playTimeSec = 0;
function getTime(audioDurationSec) {
  var total = Math.floor(_playTimeSec);
  var m = Math.floor(total / 60), s = total % 60;
  var stamp = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  if (audioDurationSec && audioDurationSec > 0) {
    _playTimeSec += audioDurationSec;
  }
  return stamp;
}

function avatarHTML(d) {
  var info = HOST_MAP[d.speaker] || { letter: d.name.charAt(0), bg: '#999', fg: '#fff', image: '' };
  var letter = '<span class="avatar-letter">' + info.letter + '</span>';
  var img = info.image ? '<img class="avatar-image" src="' + info.image + '" onerror="this.remove()" />' : '';
  return '<div class="avatar-col"><div class="avatar" style="background:' + info.bg + ';color:' + info.fg + '">' + letter + img + '</div></div>';
}

function appendMsg(d) {
  var side = d.speaker === ME ? 'right' : 'left';
  var t = getTime(d.audioDurationSec);

  if (d.section !== lastSection) {
    var div = document.createElement('div');
    div.className = 'section-divider';
    div.innerHTML = '<span>' + d.section + '</span>';
    body.appendChild(div);
    lastSection = d.section;
  }

  var row = document.createElement('div');
  row.className = 'msg-row' + (side === 'right' ? ' right' : '');
  var html = '';
  if (SHOW_AVATAR) html += avatarHTML(d);
  html += '<div class="msg-col' + (side === 'right' ? ' right' : '') + '">';
  if (SHOW_AVATAR) html += '<div class="sender-label' + (side === 'right' ? ' right' : '') + '">' + d.name + '</div>';
  var __bimgs = bubbleImages(d);
  for (var __i = 0; __i < __bimgs.length; __i++) html += '<img class="bubble-img ' + side + '" src="' + __bimgs[__i] + '" onload="window.__imgLoaded__ && window.__imgLoaded__()" onerror="this.remove()" />';
  var bInfo = HOST_MAP[d.speaker] || { bubbleBg: '', bubbleFg: '' };
  var bStyle = bInfo.bubbleBg ? 'background:' + bInfo.bubbleBg + ';color:' + bInfo.bubbleFg : '';
  html +=
      '<div class="bubble-wrap' + (side === 'right' ? ' right' : '') + '">' +
        '<div class="bubble ' + side + ' pop" style="' + bStyle + '">' + d.text + '</div>' +
        '<span class="time-stamp">' + t + '</span>' +
      '</div>' +
    '</div>';
  row.innerHTML = html;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

${this.engineScript}`;
  }
}
