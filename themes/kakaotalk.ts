import { normalizeAudioPath } from "../core/types";
import { BaseTheme } from "./base";

export class KakaoTalkTheme extends BaseTheme {
  get id() { return "kakaotalk"; }
  get label() { return "KakaoTalk"; }

  render(): string {
    return this.wrapHTML(this.css, this.html, this.js);
  }

  // ── CSS ──

  private get css(): string {
    return `
.device {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.kk-header {
  background: #3c1e1e;
  padding: 16px 22px 14px;
  display: flex; align-items: center; gap: 14px;
  flex-shrink: 0;
}
.kk-back { color: #f9e000; font-size: 22px; font-weight: 500; }
.kk-room-name {
  color: #fff; font-size: 20px; font-weight: 500; flex: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
.kk-count { color: rgba(255,255,255,0.55); font-size: 18px; white-space: nowrap; }

.kk-body {
  background: #b2c7d9;
  flex: 1; overflow-y: auto;
  padding: 16px 14px;
  display: flex; flex-direction: column; gap: 6px;
  scroll-behavior: smooth;
}

.date-divider { text-align: center; margin: 8px 0 11px; }
.date-divider span {
  background: rgba(0,0,0,0.18); color: #fff;
  font-size: 15px; padding: 4px 16px; border-radius: 20px;
}

.section-divider { text-align: center; margin: 11px 0 6px; }
.section-divider span {
  background: rgba(0,0,0,0.12); color: rgba(255,255,255,0.9);
  font-size: 14px; padding: 3px 14px; border-radius: 20px; font-weight: 500;
}

.msg-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 3px; }
.msg-row.right { flex-direction: row-reverse; }

.avatar-col { display: flex; flex-direction: column; align-items: center; width: 48px; flex-shrink: 0; }
.avatar {
  width: 48px;
  height: 48px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  font-size: 18px;
  font-weight: 500;
  line-height: 1;        /* ← key fix */
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

.msg-col { display: flex; flex-direction: column; max-width: 68%; }
.msg-col.right { align-items: flex-end; }

.sender-name { font-size: 15px; color: rgba(0,0,0,0.55); margin-bottom: 4px; padding-left: 3px; }
.sender-name.right { padding-left: 0; padding-right: 3px; }

.bubble-wrap { display: flex; align-items: flex-end; gap: 6px; }
.bubble-wrap.right { flex-direction: row-reverse; }

.bubble {
  padding: 11px 15px; font-size: 18px; line-height: 1.5;
  color: #1a1a1a; max-width: 100%; word-break: break-word;
}
.bubble.left  { background: #fff;    border-radius: 0 16px 16px 16px; }
.bubble.right { background: #f9e000; border-radius: 16px 0 16px 16px; }
.bubble.pop   { animation: popIn 0.2s ease-out; }

@keyframes popIn {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

.time-stamp { font-size: 14px; color: rgba(0,0,0,0.4); white-space: nowrap; margin-bottom: 2px; }

.bubble-img {
  max-width: 100%; max-height: 280px; width: auto; display: block;
  object-fit: cover; overflow: hidden;
  margin-bottom: 6px;
}
.bubble-img.left  { border-radius: 0 16px 16px 16px; }
.bubble-img.right { border-radius: 16px 0 16px 16px; }

.kk-footer {
  background: #f0f0f0; border-top: 0.5px solid #d0d0d0;
  padding: 11px 16px; display: flex; align-items: center; gap: 11px;
  flex-shrink: 0;
}
.kk-input {
  flex: 1; background: #fff; border: 0.5px solid #d0d0d0;
  border-radius: 24px; padding: 10px 18px; font-size: 18px; color: #999;
}
.kk-send {
  width: 44px; height: 44px; background: #f9e000; border-radius: 50%;
  border: none; display: flex; align-items: center; justify-content: center;
}`;
  }

  // ── HTML body ──

  private get html(): string {
    const ep = this.episode;
    return `
<div class="device">
  <div class="kk-header">
    <span class="kk-back">&#8249;</span>
    <span class="kk-room-name">${ep.episode_title ? ep.episode_title : ep.name ? ep.name + ' ' + 'EP.' + ep.episode_number : ''}</span>
    <span class="kk-count">${this.hostCount}</span>
  </div>
  <div class="kk-body" id="chat-body">
    <div class="date-divider"><span id="chat-date"></span></div>
    <div class="section-divider"><span>${this.firstSection}</span></div>
  </div>
  <div class="kk-footer">
    <div class="kk-input">Type a message</div>
    <div class="kk-send">
      <svg width="19" height="19" viewBox="0 0 14 14" fill="none">
        <path d="M1 7L13 1L9 13L7 8L1 7Z" fill="#3c2e00"/>
      </svg>
    </div>
  </div>
</div>`;
  }

  // ── JS ──

  private get hostMapJSON(): string {
    const colors = ["#f9e000", "#ff7043", "#66bb6a", "#42a5f5", "#ab47bc"];
    const textColors = ["#3c2e00", "#fff", "#fff", "#fff", "#fff"];
    const bubbleBgs = ["#f9e000", "#fff", "#d4f0d4", "#d4e4f7", "#ead4f7"];
    const bubbleFgs = ["#1a1a1a", "#1a1a1a", "#1a1a1a", "#1a1a1a", "#1a1a1a"];
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
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('chat-date').textContent = months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
})();
const ME = ${JSON.stringify(this.meHostId)};
const SHOW_AVATAR = ${this.showAvatar};
const HOST_MAP = ${this.hostMapJSON};

var _virtualClockMs = Date.now();
function getTime(audioDurationSec) {
  var t = new Date(_virtualClockMs);
  var h = t.getHours(), m = t.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  var stamp = ampm + ' ' + h + ':' + (m < 10 ? '0' : '') + m;
  if (audioDurationSec && audioDurationSec > 0) {
    _virtualClockMs += audioDurationSec * 1000;
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
  if (d.image) html += '<img class="bubble-img ' + side + '" src="' + d.image + '" onload="window.__imgLoaded__ && window.__imgLoaded__()" onerror="this.remove()" />';
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
