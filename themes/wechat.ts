import { normalizeAudioPath } from "../core/types";
import { BaseTheme } from "./base";

export class WeChatTheme extends BaseTheme {
  get id() { return "wechat"; }
  get label() { return "WeChat"; }

  // protected get bottomBandBg() { return "#07c160"; }
  // protected get bottomBandFg() { return "#fff"; }

  render(): string {
    return this.wrapHTML(this.css, this.html, this.js);
  }

  /** Chrome colors for the current color scheme (light default, dark variant). */
  private get palette() {
    if (this.isDark) {
      return {
        headerBg: "#1a1a1a",
        headerBorder: "#2a2a2a",
        chromeFg: "#e6e6e6",
        bodyBg: "#161616",
        timeDividerBg: "rgba(255,255,255,0.1)",
        timeDividerFg: "#ccc",
        sectionDividerBg: "rgba(255,255,255,0.08)",
        sectionDividerFg: "#8a8a8a",
        timeStampFg: "rgba(255,255,255,0.35)",
        senderNameFg: "#8a8a8a",
        leftBubbleBg: "#2c2c2c",
        leftBubbleFg: "#e6e6e6",
        rightBubbleBg: "#3eb575",
        footerBg: "#1f1f1f",
        footerBorder: "#2a2a2a",
        inputBg: "#2c2c2c",
        inputBorder: "#2a2a2a",
        inputFg: "#e6e6e6",
        extraFg: "#8a8a8a",
      };
    }
    return {
      headerBg: "#ededed",
      headerBorder: "#d4d4d4",
      chromeFg: "#181818",
      bodyBg: "#ededed",
      timeDividerBg: "rgba(0,0,0,0.12)",
      timeDividerFg: "#fff",
      sectionDividerBg: "rgba(0,0,0,0.1)",
      sectionDividerFg: "#8a8a8a",
      timeStampFg: "rgba(0,0,0,0.4)",
      senderNameFg: "#9b9b9b",
      leftBubbleBg: "#fff",
      leftBubbleFg: "#181818",
      rightBubbleBg: "#95ec69",
      footerBg: "#f7f7f7",
      footerBorder: "#d4d4d4",
      inputBg: "#fff",
      inputBorder: "#d4d4d4",
      inputFg: "#181818",
      extraFg: "#54565a",
    };
  }

  // ── CSS ──

  private get css(): string {
    const p = this.palette;
    return `
.device {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.wc-header {
  background: ${p.headerBg};
  border-bottom: 0.5px solid ${p.headerBorder};
  padding: 16px 22px 14px;
  display: flex; align-items: center; gap: 14px;
  flex-shrink: 0;
}
.wc-back { color: ${p.chromeFg}; font-size: 24px; font-weight: 500; }
.wc-room-name {
  color: ${p.chromeFg}; font-size: 21px; font-weight: 500; flex: 1; text-align: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
.wc-menu { color: ${p.chromeFg}; font-size: 24px; font-weight: 700; white-space: nowrap; letter-spacing: 1px; }

.wc-body {
  background: ${p.bodyBg};
  flex: 1; overflow-y: auto;
  padding: 16px 16px;
  display: flex; flex-direction: column; gap: 16px;
  scroll-behavior: smooth;
}

.time-divider { text-align: center; margin: 3px 0; }
.time-divider span {
  background: ${p.timeDividerBg}; color: ${p.timeDividerFg};
  font-size: 15px; padding: 3px 11px; border-radius: 5px;
}

.section-divider { text-align: center; margin: 3px 0; }
.section-divider span {
  background: ${p.sectionDividerBg}; color: ${p.sectionDividerFg};
  font-size: 15px; padding: 3px 13px; border-radius: 5px;
}

.time-stamp { font-size: 13px; color: ${p.timeStampFg}; white-space: nowrap; margin-top: 2px; }

.msg-row { display: flex; align-items: flex-start; gap: 11px; }
.msg-row.right { flex-direction: row-reverse; }

.avatar-col { display: flex; flex-direction: column; align-items: center; width: 54px; flex-shrink: 0; }
.avatar {
  width: 54px;
  height: 54px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
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

.sender-name { font-size: 15px; color: ${p.senderNameFg}; margin-bottom: 5px; padding-left: 3px; }
.sender-name.right { padding-left: 0; padding-right: 3px; }

.bubble-wrap { display: flex; align-items: flex-start; }

.bubble {
  position: relative;
  padding: 12px 16px; font-size: 19px; line-height: 1.4;
  color: ${p.leftBubbleFg}; max-width: 100%; word-break: break-word;
  border-radius: 6px;
}
/* speech-bubble tail */
.bubble::before {
  content: ''; position: absolute; top: 16px;
  width: 0; height: 0;
  border: 8px solid transparent;
}
.bubble.left  { background: ${p.leftBubbleBg}; }
.bubble.left::before {
  left: -15px; border-right-color: var(--bubble-bg, ${p.leftBubbleBg});
}
.bubble.right { background: ${p.rightBubbleBg}; }
.bubble.right::before {
  right: -15px; border-left-color: var(--bubble-bg, ${p.rightBubbleBg});
}
.bubble.pop   { animation: popIn 0.2s ease-out; }

@keyframes popIn {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

.bubble-img {
  max-width: 100%; max-height: 280px; width: auto; display: block;
  object-fit: cover; overflow: hidden;
  border-radius: 6px;
  margin-bottom: 6px;
}

.wc-footer {
  background: ${p.footerBg}; border-top: 0.5px solid ${p.footerBorder};
  padding: 11px 16px; display: flex; align-items: center; gap: 11px;
  flex-shrink: 0;
}
.wc-voice {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.wc-input {
  flex: 1; background: ${p.inputBg}; border: 0.5px solid ${p.inputBorder};
  border-radius: 6px; padding: 10px 18px; font-size: 19px; color: ${p.inputFg};
  min-height: 46px;
}
.wc-extra {
  width: 40px; height: 40px; flex-shrink: 0; color: ${p.extraFg};
  display: flex; align-items: center; justify-content: center; font-size: 30px;
}`;
  }

  // ── HTML body ──

  private get html(): string {
    const ep = this.episode;
    return `
<div class="device">
  <div class="wc-header">
    <span class="wc-back">&#8249;</span>
    <span class="wc-room-name">${ep.episode_title ? ep.episode_title : ep.name ? ep.name + ' ' + 'EP.' + ep.episode_number : ''} (${this.hostCount})</span>
    <span class="wc-menu">&#8943;</span>
  </div>
  <div class="wc-body" id="chat-body">
    <div class="time-divider"><span id="chat-date"></span></div>
    <div class="section-divider"><span>${this.firstSection}</span></div>
  </div>
  <div class="wc-footer">
    <div class="wc-voice">
      <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#54565a" stroke-width="1.6">
        <rect x="9" y="3" width="6" height="11" rx="3"/>
        <path d="M5 11a7 7 0 0 0 14 0"/>
        <line x1="12" y1="18" x2="12" y2="21"/>
      </svg>
    </div>
    <div class="wc-input">Type a message</div>
    <div class="wc-extra">&#43;</div>
  </div>
</div>`;
  }

  // ── JS ──

  private get hostMapJSON(): string {
    const colors = ["#95ec69", "#ff7043", "#66bb6a", "#42a5f5", "#ab47bc"];
    const textColors = ["#181818", "#fff", "#fff", "#fff", "#fff"];
    const bubbleBgs = this.isDark
      ? ["#3eb575", "#2c2c2c", "#2e4b34", "#2c3e52", "#3f2e52"]
      : ["#95ec69", "#fff", "#d4f0d4", "#d4e4f7", "#ead4f7"];
    const bubbleFgs = this.isDark
      ? ["#eafff0", "#e6e6e6", "#e6e6e6", "#e6e6e6", "#e6e6e6"]
      : ["#181818", "#181818", "#181818", "#181818", "#181818"];
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
(function() {
  var d = new Date();
  var h = d.getHours(), m = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  document.getElementById('chat-date').textContent = ampm + ' ' + h + ':' + (m < 10 ? '0' : '') + m;
})();
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
  if (SHOW_AVATAR) html += '<div class="sender-name' + (side === 'right' ? ' right' : '') + '">' + d.name + '</div>';
  var __bimgs = bubbleImages(d);
  for (var __i = 0; __i < __bimgs.length; __i++) html += '<img class="bubble-img" src="' + __bimgs[__i] + '" onload="window.__imgLoaded__ && window.__imgLoaded__()" onerror="this.remove()" />';
  var bInfo = HOST_MAP[d.speaker] || { bubbleBg: '', bubbleFg: '' };
  var bStyle = bInfo.bubbleBg ? 'background:' + bInfo.bubbleBg + ';color:' + bInfo.bubbleFg + ';--bubble-bg:' + bInfo.bubbleBg : '';
  html +=
      '<div class="bubble-wrap">' +
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
