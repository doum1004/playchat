import { BaseTheme, ThemeConfig } from "./base";

export class KakaoTalkTheme extends BaseTheme {
  get id() { return "kakaotalk"; }
  get label() { return "KakaoTalk"; }
  get viewport(): ThemeConfig { return { width: 400, height: 580 }; }

  render(): string {
    return this.wrapHTML(this.css, this.html, this.js);
  }

  // ── CSS ──

  private get css(): string {
    return `
.device {
  width: 400px; height: 580px;
  display: flex; flex-direction: column;
  overflow: hidden;
}

.kk-header {
  background: #3c1e1e;
  padding: 12px 16px 10px;
  display: flex; align-items: center; gap: 10px;
  flex-shrink: 0;
}
.kk-back { color: #f9e000; font-size: 16px; font-weight: 500; }
.kk-room-name { color: #fff; font-size: 15px; font-weight: 500; flex: 1; }
.kk-count { color: rgba(255,255,255,0.55); font-size: 13px; }

.kk-body {
  background: #b2c7d9;
  flex: 1; overflow-y: auto;
  padding: 12px 10px;
  display: flex; flex-direction: column; gap: 4px;
  scroll-behavior: smooth;
}

.date-divider { text-align: center; margin: 6px 0 8px; }
.date-divider span {
  background: rgba(0,0,0,0.18); color: #fff;
  font-size: 11px; padding: 3px 12px; border-radius: 20px;
}

.section-divider { text-align: center; margin: 8px 0 4px; }
.section-divider span {
  background: rgba(0,0,0,0.12); color: rgba(255,255,255,0.9);
  font-size: 10px; padding: 2px 10px; border-radius: 20px; font-weight: 500;
}

.msg-row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 2px; }
.msg-row.right { flex-direction: row-reverse; }

.avatar-col { display: flex; flex-direction: column; align-items: center; width: 36px; flex-shrink: 0; }
.avatar {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 500;
}

.msg-col { display: flex; flex-direction: column; max-width: 68%; }
.msg-col.right { align-items: flex-end; }

.sender-name { font-size: 11px; color: rgba(0,0,0,0.55); margin-bottom: 3px; padding-left: 2px; }
.sender-name.right { padding-left: 0; padding-right: 2px; }

.bubble-wrap { display: flex; align-items: flex-end; gap: 4px; }
.bubble-wrap.right { flex-direction: row-reverse; }

.bubble {
  padding: 8px 11px; font-size: 13px; line-height: 1.5;
  color: #1a1a1a; max-width: 100%; word-break: break-word;
}
.bubble.left  { background: #fff;    border-radius: 0 12px 12px 12px; }
.bubble.right { background: #f9e000; border-radius: 12px 0 12px 12px; }
.bubble.pop   { animation: popIn 0.2s ease-out; }

@keyframes popIn {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

.time-stamp { font-size: 10px; color: rgba(0,0,0,0.4); white-space: nowrap; margin-bottom: 2px; }

.kk-footer {
  background: #f0f0f0; border-top: 0.5px solid #d0d0d0;
  padding: 8px 12px; display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.kk-input {
  flex: 1; background: #fff; border: 0.5px solid #d0d0d0;
  border-radius: 20px; padding: 7px 14px; font-size: 13px; color: #999;
}
.kk-send {
  width: 32px; height: 32px; background: #f9e000; border-radius: 50%;
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
    <span class="kk-room-name">${ep.name ? ep.name + ' ' : ''}EP.${ep.episode_number}</span>
    <span class="kk-count">${this.hostCount}</span>
  </div>
  <div class="kk-body" id="chat-body">
    <div class="date-divider"><span id="chat-date"></span></div>
    <div class="section-divider"><span>${this.firstSection}</span></div>
  </div>
  <div class="kk-footer">
    <div class="kk-input">Type a message</div>
    <div class="kk-send">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
    const map: Record<string, { letter: string; bg: string; fg: string }> = {};
    this.episode.hosts.forEach((h, i) => {
      map[h.id] = {
        letter: h.name.charAt(0),
        bg: colors[i % colors.length],
        fg: textColors[i % textColors.length],
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

function getTime() {
  const now = new Date();
  let h = now.getHours(), m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return ampm + ' ' + h + ':' + (m < 10 ? '0' : '') + m;
}

function avatarHTML(d) {
  var info = HOST_MAP[d.speaker] || { letter: d.name.charAt(0), bg: '#999', fg: '#fff' };
  return '<div class="avatar-col"><div class="avatar" style="background:' + info.bg + ';color:' + info.fg + '">' + info.letter + '</div></div>';
}

function appendMsg(d) {
  var side = d.speaker === ME ? 'right' : 'left';
  var t = getTime();

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
  html +=
      '<div class="bubble-wrap' + (side === 'right' ? ' right' : '') + '">' +
        '<div class="bubble ' + side + ' pop">' + d.text + '</div>' +
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
