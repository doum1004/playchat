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

.msg-row { display: flex; margin-bottom: 2px; }
.msg-row.right { justify-content: flex-end; }
.msg-row.left  { justify-content: flex-start; }

.bubble {
  max-width: 70%; padding: 8px 12px;
  font-size: 14px; line-height: 1.45;
  word-break: break-word;
}
.bubble.right {
  background: #007aff; color: #fff;
  border-radius: 18px 18px 4px 18px;
}
.bubble.left {
  background: #e9e9eb; color: #000;
  border-radius: 18px 18px 18px 4px;
}
.bubble.pop { animation: popIn 0.18s ease-out; }

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}

.sender-label {
  font-size: 10px; color: #8e8e93;
  margin-bottom: 2px; padding-left: 4px;
}

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

  private get js(): string {
    return `
const body = document.getElementById('chat-body');

function appendMsg(d) {
  const isRight = d.speaker === 'host_1';

  if (d.section !== lastSection) {
    const div = document.createElement('div');
    div.className = 'section-divider';
    div.innerHTML = '<span>' + d.section + '</span>';
    body.appendChild(div);
    lastSection = d.section;
  }

  if (!isRight) {
    const label = document.createElement('div');
    label.className = 'sender-label';
    label.textContent = d.name;
    body.appendChild(label);
  }

  const row = document.createElement('div');
  row.className = 'msg-row ' + (isRight ? 'right' : 'left');
  row.innerHTML = '<div class="bubble ' + (isRight ? 'right' : 'left') + ' pop">' + d.text + '</div>';
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
}

${this.engineScript}`;
  }
}
