(() => {
  'use strict';

  const config = Object.freeze({
    companyId: 'ebdc0d5260994120ba4caaa6b085aac4',
    templateId: 'a17c6dc225ba4ae88a29a7564e3f3800',
    tokenEndpoint: 'https://YOUR_TOKEN_SERVER.example/api/eformsign/bulk-token'
  });
  const origin = 'https://www.eformsign.com';
  const mode = 'EMBEDDING_BULKDOCUMENT';

  class EformSignBulkDocument {
    constructor(iframe, option, callbacks, signal) {
      this.iframe = iframe;
      this.option = option;
      this.callbacks = callbacks;
      window.addEventListener('message', event => this.receive(event), { signal });
    }

    open() {
      const url = new URL('/eform/form/bulk_create.html', origin);
      url.search = new URLSearchParams({
        form_id: this.option.templateId,
        openmode: mode,
        lang_code: 'ko'
      });
      this.iframe.src = url.href;
    }

    receive(event) {
      const frameWindow = this.iframe.contentWindow;
      if (!frameWindow || event.origin !== origin || event.source !== frameWindow) return;

      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;

      switch (data.fn) {
        case 'isEmbeddingBulkDocument':
          this.sendInit(frameWindow);
          this.callbacks.ready();
          break;
        case 'saveSuccess':
          this.callbacks.success(data);
          break;
        case 'errorMessage':
          this.callbacks.error();
          break;
        case 'setStorage':
          if (isToken(data.message?.access_token)) {
            this.option.accessToken = data.message.access_token;
            if (isToken(data.message.refresh_token)) {
              this.option.refreshToken = data.message.refresh_token;
            }
          }
          break;
      }
    }

    sendInit(frameWindow) {
      frameWindow.postMessage(JSON.stringify({
        type: 'document',
        fn: 'isEmbeddingBulkDocument',
        message: {
          mode,
          company_id: this.option.companyId,
          country_code: 'kr',
          _id: this.option.memberId,
          access_token: this.option.accessToken,
          refresh_token: this.option.refreshToken,
          outside_key: '',
          action_callback: false,
          hide_title: false,
          hide_data_select: false,
          hide_request_popup: false,
          data_entry: ''
        }
      }), origin);
    }
  }

  const trigger = document.querySelector('#bulk-open');
  const dialog = document.querySelector('#bulk-dialog');
  const closeButton = document.querySelector('#bulk-close');
  const status = document.querySelector('#bulk-status');
  const mount = document.querySelector('#bulk-frame');
  let session;

  function isToken(value) {
    return typeof value === 'string' && value.length > 0 && !/\s/.test(value);
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function closeModal() {
    if (session?.frame && !session.completed &&
        !window.confirm('창을 닫으면 입력 중인 내용이 사라질 수 있습니다. 닫으시겠습니까?')) return;
    session?.controller.abort();
    clearTimeout(session?.timeout);
    session = undefined;
    mount.replaceChildren();
    dialog.close();
    trigger.focus();
  }

  closeButton.addEventListener('click', closeModal);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeModal();
  });

  trigger.addEventListener('click', async () => {
    if (dialog.open) return;
    dialog.showModal();
    const current = { controller: new AbortController() };
    session = current;
    showStatus('이폼사인 작성 화면을 준비하고 있습니다.');

    if (config.companyId.startsWith('YOUR_') || config.templateId.startsWith('YOUR_') ||
        config.tokenEndpoint.includes('YOUR_')) {
      showStatus('신청서 작성 연동을 준비 중입니다.');
      return;
    }

    const { signal } = current.controller;
    try {
      const endpoint = new URL(config.tokenEndpoint);
      if (endpoint.protocol !== 'https:') throw new Error('HTTPS required');

      current.timeout = setTimeout(() => current.controller.abort(), 15000);
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal
      });
      if (response.status === 401 || response.status === 403) {
        showStatus('신청서 작성 권한이 있는 계정으로 로그인한 후 다시 열어 주세요.');
        return;
      }
      if (!response.ok) throw new Error('Token request failed');
      const tokens = await response.json();
      if (session !== current || signal.aborted) return;
      if (typeof tokens.member_id !== 'string' || !tokens.member_id.trim() ||
          !isToken(tokens.access_token)) throw new Error('Invalid token response');

      const iframe = document.createElement('iframe');
      iframe.title = '이폼사인 일괄작성';
      iframe.referrerPolicy = 'strict-origin';
      current.frame = iframe;
      mount.append(iframe);
      new EformSignBulkDocument(iframe, {
        ...config,
        memberId: tokens.member_id,
        accessToken: tokens.access_token,
        refreshToken: isToken(tokens.refresh_token) ? tokens.refresh_token : ''
      }, {
        ready() {
          clearTimeout(current.timeout);
          if (!current.hasResult) showStatus('');
        },
        success(data) {
          clearTimeout(current.timeout);
          current.hasResult = true;
          if (String(data.code) !== '-1') {
            showStatus('전송을 완료하지 못했습니다. 작성 화면의 안내를 확인해 주세요.');
            return;
          }
          const succeeded = Array.isArray(data.success_results) ? data.success_results.length : null;
          const failed = Array.isArray(data.fail_results) ? data.fail_results.length : null;
          current.completed = failed === 0 && succeeded > 0;
          if (failed > 0) {
            const count = succeeded === null ? '' : `성공 ${succeeded}건, `;
            showStatus(`${count}실패 ${failed}건입니다. 다시 전송하기 전에 실패한 행을 확인해 주세요.`);
          } else {
            showStatus(succeeded > 0 ? `${succeeded}건의 전송 요청이 처리되었습니다.` : '전송 요청이 처리되었습니다.');
          }
        },
        error() {
          clearTimeout(current.timeout);
          current.hasResult = true;
          current.completed = false;
          showStatus('이폼사인에서 오류가 발생했습니다. 작성 화면의 안내를 확인해 주세요.');
        }
      }, signal).open();
    } catch {
      if (session === current) showStatus('작성 권한을 불러오지 못했습니다. 창을 닫고 다시 시도해 주세요.');
    } finally {
      clearTimeout(current.timeout);
      if (session === current && current.frame && !signal.aborted) {
        current.timeout = setTimeout(() => {
          showStatus('이폼사인 화면의 응답이 지연되고 있습니다. 화면이 열리지 않으면 창을 닫고 다시 시도해 주세요.');
        }, 20000);
      }
    }
  });
})();
