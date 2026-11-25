const { randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databasePath = process.env.DB_NAME || path.join(__dirname, '..', 'task_management.db');
const db = new sqlite3.Database(databasePath, (openError) => {
  if (openError) {
    console.error(`Unable to open database "${databasePath}": ${openError.message}`);
    process.exitCode = 1;
    return;
  }

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (error) {
        if (error) {
          reject(error);
        } else {
          resolve({ lastID: this.lastID });
        }
      });
    });

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (error, row) => {
        if (error) {
          reject(error);
        } else {
          resolve(row);
        }
      });
    });

  const close = () =>
    new Promise((resolve, reject) => {
      db.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

  async function seed() {
    let inTransaction = false;
    const newAccounts = [];
    const seedUsers = [
      { username: 'demo', email: 'demo@example.com' },
      { username: 'alex', email: 'alex@example.com' },
      { username: 'jordan', email: 'jordan@example.com' },
    ];

    try {
      await run('PRAGMA foreign_keys = ON');

      const tables = await get(
        `SELECT COUNT(*) AS count
         FROM sqlite_master
         WHERE type = 'table' AND name IN ('users', 'projects', 'tasks')`
      );
      if (tables.count !== 3) {
        throw new Error('Database schema not found. Run "npm.cmd run setup" first.');
      }

      await run('BEGIN IMMEDIATE');
      inTransaction = true;

      for (const seedUser of seedUsers) {
        let user = await get('SELECT id, password FROM users WHERE email = ? LIMIT 1', [
          seedUser.email,
        ]);
        if (!user || user.password.startsWith('scrypt$')) {
          const temporaryPassword = randomBytes(18).toString('hex');
          const passwordHash = await bcrypt.hash(temporaryPassword, 10);
          if (user) {
            await run('UPDATE users SET password = ? WHERE id = ?', [passwordHash, user.id]);
          } else {
            const result = await run(
              'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
              [seedUser.username, seedUser.email, passwordHash]
            );
            user = { id: result.lastID };
          }
          newAccounts.push({ email: seedUser.email, password: temporaryPassword });
        }

        for (let projectNumber = 1; projectNumber <= 2; projectNumber += 1) {
          const projectName = `${seedUser.username}'s Project ${projectNumber}`;
          let project = await get(
            'SELECT id FROM projects WHERE user_id = ? AND name = ? LIMIT 1',
            [user.id, projectName]
          );

          if (!project && projectNumber === 1) {
            project = await get(
              "SELECT id FROM projects WHERE user_id = ? AND name = 'Untitled Project' ORDER BY id LIMIT 1",
              [user.id]
            );
            if (project) {
              await run('UPDATE projects SET name = ? WHERE id = ?', [projectName, project.id]);
            }
          }

          if (!project) {
            const result = await run('INSERT INTO projects (user_id, name) VALUES (?, ?)', [
              user.id,
              projectName,
            ]);
            project = { id: result.lastID };
          }

          for (let taskNumber = 1; taskNumber <= 3; taskNumber += 1) {
            const taskTitle = `${projectName} - Task ${taskNumber}`;
            let task = await get(
              'SELECT id FROM tasks WHERE project_id = ? AND title = ? LIMIT 1',
              [project.id, taskTitle]
            );

            if (!task && taskNumber === 1) {
              task = await get(
                "SELECT id FROM tasks WHERE project_id = ? AND title = 'Untitled Task' ORDER BY id LIMIT 1",
                [project.id]
              );
              if (task) {
                await run('UPDATE tasks SET title = ? WHERE id = ?', [taskTitle, task.id]);
              }
            }

            if (!task) {
              await run('INSERT INTO tasks (project_id, title) VALUES (?, ?)', [
                project.id,
                taskTitle,
              ]);
            }
          }
        }
      }

      await run('COMMIT');
      inTransaction = false;
      console.log('Seed data is ready: 3 users, 2 projects per user, and 3 tasks per project.');
      if (newAccounts.length > 0) {
        console.log('Temporary passwords for newly created or upgraded demo accounts:');
        for (const account of newAccounts) {
          console.log(`${account.email}: ${account.password}`);
        }
      }
    } catch (error) {
      if (inTransaction) {
        try {
          await run('ROLLBACK');
        } catch (rollbackError) {
          console.error(`Unable to roll back seed transaction: ${rollbackError.message}`);
        }
      }
      console.error(`Unable to seed database: ${error.message}`);
      process.exitCode = 1;
    } finally {
      try {
        await close();
      } catch (error) {
        console.error(`Unable to close database: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }

  seed();
});
