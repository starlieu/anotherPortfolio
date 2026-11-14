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
  if (navbar) window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));

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
  } else revealElements.forEach(el => el.classList.add('active'));

  // Show application activities only; never expose profile or online status.
  const presenceCard = document.getElementById('discord-presence');
  if (presenceCard) {
    const userId = '1242039694540279838';
    const activityLabel = document.getElementById('discord-activity-label');
    const activityName = document.getElementById('discord-activity-name');
    const activityDetails = document.getElementById('discord-activity-details');
    const activityState = document.getElementById('discord-activity-state');
    const activityArt = document.getElementById('discord-activity-art');
    const activityImage = document.getElementById('discord-activity-image');
    const activitySmallImage = document.getElementById('discord-activity-small-image');
    const progress = document.getElementById('discord-activity-progress');
    const progressFill = document.getElementById('discord-activity-fill');
    const elapsedTime = document.getElementById('discord-activity-elapsed');
    const durationTime = document.getElementById('discord-activity-duration');
    let socket, heartbeat, reconnectTimer, progressTimer;
    let reconnectDelay = 1000;
    let closedByPage = false;
    let renderVersion = 0;
    let currentTimestamps = null;

    [activityImage, activitySmallImage].forEach(image => {
      if (!image) return;
      image.loading = 'eager';
      image.decoding = 'async';
      image.fetchPriority = 'high';
    });

    const typeLabels = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };

    const candidatesFor = (key, activity) => {
      if (!key) return [];
      if (/^https?:\/\//i.test(key)) return [key];
      if (key.startsWith('mp:external/')) {
        // Discord encodes external asset URLs in mp:external/<encoded URL>/<size>.
        const rest = key.slice('mp:external/'.length);
        const match = rest.match(/^(https?%3A%2F%2F[^/]+(?:%2F[^/]+)*)\/(?:\d+)(?:\?.*)?$/i);
        if (match) {
          try { return [decodeURIComponent(match[1])]; } catch (_) {}
        }
        try {
          const decoded = decodeURIComponent(rest);
          const urlMatch = decoded.match(/https?:\/\/[^\s]+/i);
          if (urlMatch) return [urlMatch[0]];
        } catch (_) {}
        return [`https://media.discordapp.net/external/${rest}`];
      }
      // Spotify's artwork key is an image identifier, not an app asset.
      if (key.startsWith('spotify:')) return [`https://i.scdn.co/image/${key.slice('spotify:'.length)}`];
      if (key.startsWith('https://i.scdn.co/')) return [key];

      const appId = activity.application_id;
      if (!appId) return [];
      // Discord RPC asset keys must be requested through the application-assets
      // endpoint. Try supported formats and the legacy app-assets route.
      const encodedKey = encodeURIComponent(key.replace(/^mp:/, ''));
      return [
        `https://cdn.discordapp.com/app-assets/${appId}/${encodedKey}.png?size=512`,
        `https://cdn.discordapp.com/app-assets/${appId}/${encodedKey}.webp?size=512`,
        `https://cdn.discordapp.com/app-assets/${appId}/${encodedKey}.jpg?size=512`,
        `https://cdn.discordapp.com/app-assets/${appId}/${encodedKey}?size=512`,
        `https://cdn.discordapp.com/app-assets/${appId}/${encodedKey}.png`,
        `https://cdn.discordapp.com/applications/${appId}/assets/${encodedKey}.png?size=512`,
        `https://cdn.discordapp.com/applications/${appId}/assets/${encodedKey}.webp?size=512`
      ];
    };

    const preload = candidates => new Promise(resolve => {
      let index = 0;
      const next = () => {
        if (index >= candidates.length) return resolve('');
        const url = candidates[index++];
        const probe = new Image();
        probe.onload = () => resolve(url);
        probe.onerror = next;
        probe.src = url;
      };
      next();
    });

    const formatTime = milliseconds => {
      const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
      return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
    };

    const updateProgress = () => {
      if (!currentTimestamps || !currentTimestamps.start || !currentTimestamps.end) return;
      const duration = Math.max(0, currentTimestamps.end - currentTimestamps.start);
      const elapsed = Math.min(duration, Math.max(0, Date.now() - currentTimestamps.start));
      progressFill.style.width = `${duration ? elapsed / duration * 100 : 0}%`;
      elapsedTime.textContent = formatTime(elapsed);
      durationTime.textContent = formatTime(duration);
    };

    const setImage = (element, url) => new Promise(resolve => {
      if (!element || !url) return resolve(false);
      element.onload = () => resolve(true);
      element.onerror = () => resolve(false);
      element.src = url;
    });

    const loadAsset = async (keys, activity) => {
      for (const key of keys) {
        for (const url of candidatesFor(key, activity)) {
          const probe = new Image();
          const loaded = await new Promise(resolve => {
            probe.onload = () => resolve(true);
            probe.onerror = () => resolve(false);
            probe.src = url;
          });
          if (loaded) return url;
        }
      }
      return '';
    };

    const renderPresence = async data => {
      const activities = Array.isArray(data && data.activities) ? data.activities : [];
      const activity = activities.find(item => item && item.type !== 4 &&
        (item.name || item.details || item.state || item.assets));
      const version = ++renderVersion;
      if (!activity) {
        presenceCard.hidden = true;
        clearInterval(progressTimer);
        currentTimestamps = null;
        return;
      }

      const label = typeLabels[activity.type] || 'Activity';
      activityLabel.textContent = activity.type === 2 && activity.name === 'Spotify'
        ? `Listening to ${activity.details || activity.name}`
        : `${label}${activity.type === 1 && activity.url ? ` ${activity.name || ''}` : ''}`.trim();
      activityName.textContent = activity.name || 'Rich Presence';
      activityDetails.textContent = activity.details || '';
      activityDetails.hidden = !activity.details;
      activityState.textContent = activity.state || '';
      activityState.hidden = !activity.state;

      const timestamps = activity.timestamps || {};
      currentTimestamps = activity.type === 2 && timestamps.start && timestamps.end ? timestamps : null;
      clearInterval(progressTimer);
      if (currentTimestamps) {
        progress.hidden = false;
        updateProgress();
        progressTimer = setInterval(updateProgress, 1000);
      } else progress.hidden = true;

      const [largeUrl, smallUrl] = await Promise.all([
        loadAsset([activity.assets && activity.assets.large_image], activity),
        loadAsset([activity.assets && activity.assets.small_image], activity)
      ]);
      if (version !== renderVersion) return;

      const mainUrl = largeUrl || smallUrl;
      if (mainUrl) {
        activityImage.src = mainUrl;
        activityImage.hidden = false;
        activityArt.hidden = false;
      } else {
        activityImage.removeAttribute('src');
        activityImage.hidden = true;
        activityArt.hidden = true;
      }
      if (largeUrl && smallUrl && largeUrl !== smallUrl) {
        activitySmallImage.src = smallUrl;
        activitySmallImage.hidden = false;
      } else {
        activitySmallImage.removeAttribute('src');
        activitySmallImage.hidden = true;
      }
      presenceCard.hidden = false;
    };

    const connect = () => {
      if (closedByPage) return;
      try { socket = new WebSocket('wss://api.lanyard.rest/socket'); }
      catch (_) { scheduleReconnect(); return; }
      socket.addEventListener('open', () => { reconnectDelay = 1000; });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
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
      clearInterval(progressTimer);
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