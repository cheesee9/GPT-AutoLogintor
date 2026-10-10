import { createController } from './core.js';

const controller = createController(chrome);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Accept only our popup, never webpages, content scripts or other extensions.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) {
    sendResponse({ ok: false, message: '请求来源不正确。' });
    return false;
  }
  controller.run(message).then(sendResponse, () => sendResponse({ ok: false, message: '操作未完成，请重新打开扩展。' }));
  return true;
});
