# Resources for this project

Links are to official docs and well-known references. Open them to confirm they still work, since sites move pages around.

## Backend (Node, Express, MySQL)
- Express routing and middleware: https://expressjs.com/en/guide/routing.html
- Express error handling: https://expressjs.com/en/guide/error-handling.html
- mysql2 (pools, transactions, prepared statements): https://sidorares.github.io/node-mysql2/docs
- MySQL 8 reference (indexes, foreign keys, FULLTEXT): https://dev.mysql.com/doc/refman/8.0/en/
- MySQL date and time functions (TIMESTAMPDIFF, NOW): https://dev.mysql.com/doc/refman/8.0/en/date-and-time-functions.html
- Socket.IO (server, rooms, auth): https://socket.io/docs/v4/
- node-cron: https://github.com/node-cron/node-cron
- jsonwebtoken: https://github.com/auth0/node-jsonwebtoken
- bcryptjs: https://github.com/dcodeIO/bcrypt.js
- Helmet: https://helmetjs.github.io/
- express-rate-limit: https://github.com/express-rate-limit/express-rate-limit

## AI and NLP
- OpenAI API quickstart: https://platform.openai.com/docs/quickstart
- OpenAI structured / JSON outputs: https://platform.openai.com/docs/guides/structured-outputs
- Prompt injection basics (why the classifier prompt ignores ticket instructions): https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Free alternatives for sentiment: the `sentiment` and `natural` npm packages (https://www.npmjs.com/package/natural)

## Frontend and 3D
- Three.js docs and examples: https://threejs.org/docs/ and https://threejs.org/examples/
- Three.js fundamentals (great first read): https://threejs.org/manual/#en/fundamentals
- Spline (no-code 3D, embeds as a web component): https://docs.spline.design/
- Vanilla-Tilt.js: https://micku7zu.github.io/vanilla-tilt.js/
- CSS backdrop-filter (glassmorphism): https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter
- CSS color-mix() and custom properties for theming: https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix
- prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- Tailwind CSS (if you want to restyle with utilities): https://tailwindcss.com/docs

## Support-desk concepts
- What an SLA is and how first-response and resolution targets work: search "ticket SLA first response resolution time" in Zendesk, Freshdesk or Jira Service Management docs
- Jira Service Management SLA setup (a good real-world model for pause on "waiting for customer"): https://support.atlassian.com/jira-service-management-cloud/docs/what-are-slas/
- Zendesk ticket lifecycle and statuses: https://support.zendesk.com/hc/en-us/articles/4408887617050

## Security
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OWASP Cheat Sheets (authentication, session, SQL injection, XSS): https://cheatsheetseries.owasp.org/
- Node.js security best practices: https://nodejs.org/en/learn/getting-started/security-best-practices

## Deployment
- Render (Node web service + managed hosting): https://render.com/docs
- Railway (Node + MySQL add-on): https://docs.railway.com/
- Netlify / Vercel for a static frontend: https://docs.netlify.com/ and https://vercel.com/docs
- Nginx reverse proxy for Node on a VPS: https://nginx.org/en/docs/
- PM2 process manager: https://pm2.io/docs/runtime/guide/process-management/

## Portfolio tips
- Record a 60-second screen capture: send a ticket, watch it appear on the agent desk, watch the SLA timer run
- Screenshot the schema as an ER diagram (MySQL Workbench or dbdiagram.io: https://dbdiagram.io/)
- Add the metrics you can prove: classification accuracy on your sample set, SLA compliance on the dashboard
