const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const schedule = require('node-schedule');

const app = express();
app.use(bodyParser.json());
app.use(session({
  secret: 'simpleSecret',
  resave: false,
  saveUninitialized: true
}));

// In-memory data stores
let users = [];   // Each user: { id, username, password }
let events = [];  // Each event: { id, userId, name, description, date, time, category, reminder, reminderJob }

// Middleware for authentication
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// ---------------------
// User Authentication
// ---------------------

// Sign up new users
app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: 'User already exists' });
  }
  const id = users.length + 1;
  users.push({ id, username, password });
  res.json({ message: 'User created successfully' });
});

// Login existing users
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.userId = user.id;
    res.json({ message: 'Login successful' });
  } else {
    res.status(400).json({ message: 'Invalid credentials' });
  }
});

// Logout
app.post('/logout', isAuthenticated, (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// ---------------------
// Event Endpoints
// ---------------------

// Create an event
app.post('/events', isAuthenticated, (req, res) => {
  const { name, description, date, time, category, reminder } = req.body;
  const eventId = events.length + 1;
  const userId = req.session.userId;
  const eventDateTime = new Date(`${date}T${time}`);
  
  // Schedule reminder if requested (e.g., 5 minutes before event)
  let reminderJob = null;
  if (reminder) {
    const reminderTime = new Date(eventDateTime.getTime() - 5 * 60 * 1000);
    if (reminderTime > new Date()) {
      reminderJob = schedule.scheduleJob(reminderTime, () => {
        console.log(`Reminder: Event '${name}' is starting soon!`);
      });
    }
  }
  
  const newEvent = { id: eventId, userId, name, description, date, time, category, reminder, reminderJob };
  events.push(newEvent);
  res.json({ message: 'Event created successfully', event: newEvent });
});

// View upcoming events with sorting options (by date, category, or reminder status)
app.get('/events', isAuthenticated, (req, res) => {
  const { sortBy } = req.query;
  let userEvents = events.filter(e => e.userId === req.session.userId);
  
  if (sortBy === 'date') {
    userEvents.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
  } else if (sortBy === 'category') {
    userEvents.sort((a, b) => a.category.localeCompare(b.category));
  } else if (sortBy === 'reminder') {
    // Events with reminders first
    userEvents.sort((a, b) => (a.reminder ? 0 : 1) - (b.reminder ? 0 : 1));
  }
  
  res.json(userEvents);
});

// Export the app for testing purposes
module.exports = app;

// ---------------------
// Start Server
// ---------------------
if (require.main === module && process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

/* ---------------------
   Integrated Test Suite
   Run with: NODE_ENV=test mocha app.js
--------------------- */
if (process.env.NODE_ENV === 'test') {
  const request = require('supertest');
  const { expect } = require('chai');

  describe('Event Planning API', function() {
    let agent = request.agent(app);
    
    before(function(done) {
      agent
        .post('/signup')
        .send({ username: 'testuser', password: 'password' })
        .end(function(err, res) {
          done(err);
        });
    });
    
    it('should login the user', function(done) {
      agent
        .post('/login')
        .send({ username: 'testuser', password: 'password' })
        .expect(200, done);
    });
    
    it('should create an event', function(done) {
      agent
        .post('/events')
        .send({
          name: 'Meeting',
          description: 'Team meeting',
          date: '2025-04-01',
          time: '10:00',
          category: 'Meetings',
          reminder: true
        })
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          expect(res.body.message).to.equal('Event created successfully');
          done();
        });
    });
    
    it('should retrieve events sorted by date', function(done) {
      agent
        .get('/events?sortBy=date')
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          expect(res.body).to.be.an('array');
          done();
        });
    });
  });
}
