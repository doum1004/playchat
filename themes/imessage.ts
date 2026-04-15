import { BaseTheme, ThemeConfig } from "./base";

export class IMessageTheme extends BaseTheme {
  get id() { return "imessage"; }
  get label() { return "iMessage"; }
  get viewport(): ThemeConfig { return { width: 400, height: 580 }; }

  render(): string {
    return this.wrapHTML(this.css, this.html, this.js);
  }

  private get css(): string {
    return `
.device {
  width: 400px; height: 580px;
  display: flex; flex-direction: column;
  background: #fff;
}

.im-header {
  background: #f6f6f6; border-bottom: 0.5px solid #c8c8c8;
  padding: 14px 16px 10px; text-align: center; flex-shrink: 0;
}
.im-header .title { font-size: 15px; font-weight: 600; color: #000; }
.im-header .subtitle { font-size: 11px; color: #8e8e93; }

.im-body {
  flex: 1; overflow-y: auto; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
  scroll-behavior: smooth; background: #fff;
}

.section-divider { text-align: center; margin: 8px 0; }
.section-divider span {
  font-size: 10px; color: #8e8e93; font-weight: 500;
}

.msg-row { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 2px; }
.msg-row.right { flex-direction: row-reverse; }

.avatar-col { width: 30px; flex-shrink: 0; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600;
}

.msg-col { display: flex; flex-direction: column; max-width: 70%; }
.msg-col.right { align-items: flex-end; }

.sender-label {
  font-size: 10px; color: #8e8e93;
  margin-bottom: 2px; padding-left: 4px;
}
.sender-label.right { padding-left: 0; padding-right: 4px; }

.bubble-wrap { display: flex; align-items: flex-end; gap: 4px; }
.bubble-wrap.right { flex-direction: row-reverse; }

.bubble {
  padding: 8px 12px;
  font-size: 14px; line-height: 1.45;
  word-break: break-word;
}
.bubble.right {
  background: #007aff; color: #fff;
  border-radius: 18px 0 18px 18px;
}
.bubble.left {
  background: #e9e9eb; color: #000;
  border-radius: 0 18px 18px 18px;
}
.bubble.pop { animation: popIn 0.18s ease-out; }

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}

.time-stamp { font-size: 9px; color: #8e8e93; white-space: nowrap; margin-bottom: 2px; }

.im-footer {
  border-top: 0.5px solid #c8c8c8; padding: 8px 12px;
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  background: #f6f6f6;
}
.im-input {
  flex: 1; border: 0.5px solid #c8c8c8; border-radius: 18px;
  padding: 7px 14px; font-size: 13px; color: #999; background: #fff;
}
.im-send {
  width: 30px; height: 30px; background: #007aff; border-radius: 50%;
  border: none; display: flex; align-items: center; justify-content: center;
}
.im-send svg { fill: #fff; }`;
  }

  private get html(): string {
    const ep = this.episode;
    return `
<div class="device">
  <div class="im-header">
    <div class="title">톡톡 영어 EP.${ep.episode_number}</div>
    <div class="subtitle">${this.hostCount} people</div>
  </div>
  <div class="im-body" id="chat-body">
    <div class="section-divider"><span>${this.firstSection}</span></div>
  </div>
  <div class="im-footer">
    <div class="im-input">iMessage</div>
    <div class="im-send">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <path d="M7 1L13 13H1L7 1Z"/>
      </svg>
    </div>
  </div>
</div>`;
  }

  private get hostMapJSON(): string {
    const colors = ["#007aff", "#e9e9eb", "#34c759", "#ff9500", "#af52de"];
    const textColors = ["#fff", "#555", "#fff", "#fff", "#fff"];
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
const ME = ${JSON.stringify(this.meHostId)};
const SHOW_AVATAR = ${this.showAvatar};
const HOST_MAP = ${this.hostMapJSON};

function avatarHTML(d) {
  var info = HOST_MAP[d.speaker] || { letter: d.name.charAt(0), bg: '#999', fg: '#fff' };
  return '<div class="avatar-col"><div class="avatar" style="background:' + info.bg + ';color:' + info.fg + '">' + info.letter + '</div></div>';
}

function appendMsg(d) {
  var side = d.speaker === ME ? 'right' : 'left';

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
  html +=
      '<div class="bubble-wrap' + (side === 'right' ? ' right' : '') + '">' +
        '<div class="bubble ' + side + ' pop">' + d.text + '</div>' +
        '<span class="time-stamp"></span>' +
      '</div>' +
    '</div>';
  row.innerHTML = html;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

${this.engineScript}`;
  }
}
