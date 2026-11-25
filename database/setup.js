const path = require('path');
const { DataTypes, Sequelize } = require('sequelize');

const databasePath = process.env.DB_NAME
  ? path.resolve(process.env.DB_NAME)
  : path.join(__dirname, '..', 'task_management.db');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: databasePath,
  logging: false,
});

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: 'users',
    timestamps: false,
  }
);

const Project = sequelize.define(
  'Project',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Untitled Project',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
    },
  },
  {
    tableName: 'projects',
    timestamps: false,
  }
);

const Task = sequelize.define(
  'Task',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Untitled Task',
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'project_id',
    },
  },
  {
    tableName: 'tasks',
    timestamps: false,
  }
);

User.hasMany(Project, {
  as: 'projects',
  foreignKey: 'userId',
  onDelete: 'CASCADE',
});
Project.belongsTo(User, {
  as: 'user',
  foreignKey: 'userId',
  onDelete: 'CASCADE',
});
Project.hasMany(Task, {
  as: 'tasks',
  foreignKey: 'projectId',
  onDelete: 'CASCADE',
});
Task.belongsTo(Project, {
  as: 'project',
  foreignKey: 'projectId',
  onDelete: 'CASCADE',
});

async function setupDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    const queryInterface = sequelize.getQueryInterface();
    const projectColumns = await queryInterface.describeTable('projects');
    if (!projectColumns.name) {
      await queryInterface.addColumn('projects', 'name', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Untitled Project',
      });
    }

    const taskColumns = await queryInterface.describeTable('tasks');
    if (!taskColumns.title) {
      await queryInterface.addColumn('tasks', 'title', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Untitled Task',
      });
    }

    console.log('Users, projects, and tasks tables are ready.');
  } catch (error) {
    console.error(`Unable to set up database: ${error.message}`);
    process.exitCode = 1;
  } finally {
    try {
      await sequelize.close();
    } catch (error) {
      console.error(`Unable to close database: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = { sequelize, User, Project, Task };
