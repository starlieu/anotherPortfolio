document.addEventListener('DOMContentLoaded', () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('active'));
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('active'));
    });
  }

  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));
  }

  const revealElements = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('active'));
  }

  // Render a Discord activity and its activity-type label; never render profile/status.
  const presenceCard = document.getElementById('discord-presence');
  if (presenceCard) {
    const userId = '1242039694540279838';
    const activityLabel = document.getElementById('discord-activity-label');
    const activityName = document.getElementById('discord-activity-name');
    const activityDetails = document.getElementById('discord-activity-details');
    const activityState = document.getElementById('discord-activity-state');
    const activityImage = document.getElementById('discord-activity-image');
    const activityArt = activityImage && activityImage.parentElement;
    let socket;
    let heartbeat;
    let reconnectTimer;
    let reconnectDelay = 1000;
    let closedByPage = false;
    let renderVersion = 0;

    if (activityImage) {
      activityImage.loading = 'eager';
      activityImage.decoding = 'async';
      activityImage.fetchPriority = 'high';
    }

    const typeLabels = {
      0: 'Playing',
      1: 'Streaming',
      2: 'Listening to',
      3: 'Watching',
      5: 'Competing in'
    };

    const normalizeImageKey = key => {
      if (!key) return '';
      if (/^https?:\/\//i.test(key)) return key;
      if (key.startsWith('mp:external/')) {
        const externalPath = key.slice('mp:external/'.length);
        const encodedUrl = externalPath.split('/')[0];
        try {
          const decoded = decodeURIComponent(encodedUrl);
          if (/^https?:\/\//i.test(decoded)) return decoded;
        } catch (_) { /* Try Discord's image proxy below. */ }
        return `https://media.discordapp.net/${externalPath}`;
      }
      if (key.startsWith('spotify:')) return `https://i.scdn.co/image/${key.slice('spotify:'.length)}`;
      return '';
    };

    const getImageCandidates = activity => {
      const assets = activity && activity.assets;
      if (!assets) return [];
      const candidates = [];
      // Lanyard can return a direct URL, a Discord proxy key, or an app asset key.
      [assets.large_image, assets.small_image].filter(Boolean).forEach(key => {
        const direct = normalizeImageKey(key);
        if (direct) candidates.push(direct);
        else if (activity.application_id) {
          const assetKey = key.replace(/^mp:/, '');
          candidates.push(`https://cdn.discordapp.com/app-assets/${activity.application_id}/${assetKey}.png?size=512`);
          candidates.push(`https://cdn.discordapp.com/app-assets/${activity.application_id}/${assetKey}.webp?size=512`);
        }
      });
      return [...new Set(candidates)];
    };

    const preloadImage = candidates => new Promise(resolve => {
      if (!candidates.length) return resolve('');
      let index = 0;
      const tryNext = () => {
        if (index >= candidates.length) return resolve('');
        const url = candidates[index++];
        const probe = new Image();
        probe.onload = () => resolve(url);
        probe.onerror = tryNext;
        probe.src = url;
      };
      tryNext();
    });

    const renderPresence = async data => {
      const activities = Array.isArray(data && data.activities) ? data.activities : [];
      // Exclude custom status only. Preserve games, streaming, music, watching and competing.
      const activity = activities.find(item => item && item.type !== 4 &&
        (item.name || item.details || item.state || item.assets));
      const version = ++renderVersion;

      if (!activity) {
        presenceCard.hidden = true;
        return;
      }

      if (activityLabel) activityLabel.textContent = typeLabels[activity.type] || 'Activity';
      activityName.textContent = activity.name || 'Rich Presence';
      activityDetails.textContent = activity.details || '';
      activityDetails.hidden = !activity.details;
      activityState.textContent = activity.state || '';
      activityState.hidden = !activity.state;

      const imageUrl = await preloadImage(getImageCandidates(activity));
      if (version !== renderVersion) return;
      if (imageUrl) {
        activityImage.src = imageUrl;
        activityImage.hidden = false;
        if (activityArt) activityArt.hidden = false;
      } else {
        activityImage.removeAttribute('src');
        activityImage.hidden = true;
        if (activityArt) activityArt.hidden = true;
      }
      presenceCard.hidden = false;
    };

    const connect = () => {
      if (closedByPage) return;
      try {
        socket = new WebSocket('wss://api.lanyard.rest/socket');
      } catch (error) {
        scheduleReconnect();
        return;
      }
      socket.addEventListener('open', () => { reconnectDelay = 1000; });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        if (message.op === 1 && message.d && message.d.heartbeat_interval) {
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 3 }));
          }, message.d.heartbeat_interval);
          socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: userId } }));
        } else if (message.op === 0 && (message.t === 'INIT_STATE' || message.t === 'PRESENCE_UPDATE')) {
          renderPresence(message.d);
        }
      });
      socket.addEventListener('close', () => {
        clearInterval(heartbeat);
        socket = null;
        scheduleReconnect();
      });
      socket.addEventListener('error', () => { if (socket) socket.close(); });
    };

    const scheduleReconnect = () => {
      if (closedByPage || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect();
      }, reconnectDelay);
    };

    connect();
    window.addEventListener('beforeunload', () => {
      closedByPage = true;
      clearInterval(heartbeat);
      clearTimeout(reconnectTimer);
      if (socket) socket.close();
    });
  }

  const canvas = document.getElementById('starsCanvas');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      let width = canvas.width = window.innerWidth;
      let height = canvas.height = window.innerHeight;
      window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      });
      const numStars = Math.floor((width * height) / 10000);
      const stars = [];
      for (let i = 0; i < numStars; i++) stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.2,
        alpha: Math.random(),
        speed: 0.003 + Math.random() * 0.005
      });
      function renderStars() {
        ctx.clearRect(0, 0, width, height);
        stars.forEach(star => {
          star.alpha += star.speed;
          if (star.alpha > 1 || star.alpha < 0) star.speed = -star.speed;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 180, 255, ${Math.max(0, star.alpha * 0.5)})`;
          ctx.fill();
        });
        requestAnimationFrame(renderStars);
      }
      renderStars();
    }
  }
});