const { randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const { sequelize, User, Project } = require('./database/setup');

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('Using a temporary development session secret; sessions reset when the server restarts.');
}

const app = express();
app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'username', 'email'],
    });

    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

app.post('/api/register', async (req, res, next) => {
  const { username, email, password } = req.body || {};

  if (
    typeof username !== 'string' ||
    !username.trim() ||
    typeof email !== 'string' ||
    !email.trim() ||
    typeof password !== 'string' ||
    !password
  ) {
    return res.status(400).json({
      error: 'username, email, and password are required.',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'A user with this email already exists.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/login', async (req, res, next) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  try {
    const user = await User.findOne({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        return next(regenerateError);
      }

      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) {
          return next(saveError);
        }

        return res.status(200).json({
          message: 'Login successful.',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
          },
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return res.json({ message: 'Logout successful.' });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

app.get('/api/projects', requireAuth, async (req, res, next) => {
  try {
    const projects = await Project.findAll({
      where: { userId: req.user.id },
      order: [['id', 'ASC']],
    });

    return res.json({ projects });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  return res.status(500).json({ error: 'Internal server error.' });
});

async function startServer() {
  await sequelize.authenticate();
  await sequelize.sync();

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`Unable to start server: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { app, sequelize, User, requireAuth };
