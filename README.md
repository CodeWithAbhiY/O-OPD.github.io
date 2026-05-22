# O-OPD

**Book doctor appointments at nearby hospitals with real-time slot availability.**

O-OPD is a web application that helps patients find hospitals and health care
centres near them that have open OPD slots — filtered by the **specialty** they
need and the **date** that works for them. Instead of calling around or waiting
in queues, a patient searches once and books in seconds.

🔗 **Live demo:** https://codewithabhiy.github.io/O-OPD.github.io/

---

## Features

- **Specialty search** — find care by location, specialty/department and date.
- **Search results & booking** — a results page lists nearby doctors/hospitals
  with ratings, fees and available time slots; pick a slot and book in a couple
  of clicks. Bookings are saved in the browser and appear under "My
  Appointments". *(Currently powered by sample data; ready to connect to a real API.)*
- **AI Specialty Recommender** — not sure which specialty you need? Describe your
  symptoms and get a suggested specialty (on-device keyword matching for now,
  designed to be swapped for a real model later).
- **Use my location** — auto-fill the location field using the browser's
  geolocation + reverse geocoding (works on HTTPS).
- **Accounts** — formal login, sign up, and password-reset pages with
  client-side validation.
- **My Appointments** — a dashboard for past and upcoming appointments.
- **Fully responsive** — adapts cleanly from mobile to desktop.

## Tech stack

- **Front-end:** HTML, CSS (custom design system, no framework), vanilla JavaScript
- **Icons & fonts:** Material Symbols, Font Awesome, Google Fonts
- **Geocoding:** BigDataCloud reverse-geocoding (key-less, client-side)
- **Hosting:** GitHub Pages
- **Planned back-end:** Node.js + Express (for search, auth and bookings)

## Project structure

```
.
├── index.html                  # Landing page (hero, search, AI recommender)
├── results.html                # Search results + booking
├── login.html                  # Login
├── Sign_up.html                # Sign up
├── forget_password.html        # Reset password
├── Appointment_section.html    # My Appointments dashboard
├── css/
│   ├── theme.css               # Shared design system (tokens, navbar, footer)
│   ├── style.css               # Landing page styles
│   ├── results.css             # Search results + booking styles
│   ├── auth.css                # Login / sign up / reset styles
│   └── style_appointment_Sec.css
├── script/
│   ├── scripts.js              # Navbar interactions
│   ├── results.js              # Results, slot selection, booking (mock data)
│   ├── ai-recommender.js       # AI Specialty Recommender modal
│   ├── geolocation.js          # "Use my location"
│   ├── auth.js                 # Auth form validation
│   └── script_appointment_sec.js
└── img/                        # Images
```

## Run locally

It's a static site, so any static server works. For example, with Python:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. (Geolocation needs `localhost` or HTTPS — it
won't prompt when opening the file directly.)

## Roadmap

- [x] Search results page (hospitals/doctors + available slots + booking, mock data)
- [ ] Node.js + Express back-end with a database
- [ ] Real authentication and OTP
- [ ] Move bookings/search from mock data + localStorage to the back-end
- [ ] Real AI-powered specialty recommendation

## Status

The front-end is complete and responsive, and the full **search → results →
book → My Appointments** flow works end-to-end using sample data (bookings are
stored in the browser via `localStorage`). The next step is a Node.js + Express
back-end to replace the mock data with real hospitals, slots, accounts and
persisted bookings.
