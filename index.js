'use strict';

class MyPlugin {
  constructor() {
    this.commands = {
      deploy: {
        lifecycleEvents: [
          'resources',
          'functions'
        ]
      },
    };
  }
}

module.exports = MyPlugin;