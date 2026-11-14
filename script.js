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

  // Show all Discord activities exposed by Lanyard, without rendering profile or online status.
  const presenceCard = document.getElementById('discord-presence');
  if (presenceCard) {
    const userId = '1242039694540279838';
    const activityName = document.getElementById('discord-activity-name');
    const activityDetails = document.getElementById('discord-activity-details');
    const activityState = document.getElementById('discord-activity-state');
    const activityImage = document.getElementById('discord-activity-image');
    let socket;
    let heartbeat;
    let reconnectTimer;
    let reconnectDelay = 1000;
    let closedByPage = false;

    const renderPresence = data => {
      const activities = Array.isArray(data && data.activities) ? data.activities : [];
      // Exclude only Discord custom status (type 4). Keep games, streaming, listening/music,
      // watching, competing and app RPCs (including those without application_id).
      const activity = activities.find(item => item && item.type !== 4 &&
        (item.name || item.details || item.state || item.assets));

      if (!activity) {
        presenceCard.hidden = true;
        return;
      }

      activityName.textContent = activity.name || 'Rich Presence';
      activityDetails.textContent = activity.details || '';
      activityDetails.hidden = !activity.details;
      activityState.textContent = activity.state || '';
      activityState.hidden = !activity.state;

      const image = activity.assets && (activity.assets.large_image || activity.assets.small_image);
      let imageUrl = '';
      if (image && /^https?:\/\//i.test(image)) {
        imageUrl = image;
      } else if (image && image.startsWith('mp:external/')) {
        imageUrl = `https://media.discordapp.net/${image.slice(3)}`;
      } else if (image && activity.application_id) {
        imageUrl = `https://cdn.discordapp.com/app-assets/${activity.application_id}/${image}.png`;
      }

      if (imageUrl) {
        activityImage.src = imageUrl;
        activityImage.hidden = false;
        presenceCard.classList.add('has-image');
      } else {
        activityImage.removeAttribute('src');
        activityImage.hidden = true;
        presenceCard.classList.remove('has-image');
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
