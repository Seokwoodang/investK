/* InvestKang 웹푸시 서비스 워커.
   서버(/api/cron/alerts)가 보낸 푸시를 브라우저 알림으로 표시하고, 클릭 시 해당 페이지를 연다. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'InvestKang', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'InvestKang 알림';
  const options = {
    body: data.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    tag: data.tag || undefined, // 같은 tag는 겹쳐쓰기(도배 방지)
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
