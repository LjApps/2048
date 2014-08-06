function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Generates tile value
GameManager.prototype.randomTile = function () {
  var rand = Math.random();
  return rand < 0.7 ? 2 : (rand < 0.9 ? 4 : 8);
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    window.timeOut = 700;
    if(window.trySlideDown) {
      window.moveObj.move(2); clearTimeout(window.trySlideDown); window.trySlideDown = null;
    }
    if(window.moveObj) {
      clearTimeout(window.autoFall);
      window.autoFall = setTimeout(function(){window.moveObj.move(4);}, window.timeOut);
    }
    var tile = new Tile(this.grid.randomAvailableCell(), this.nextTile);
    this.nextTile = this.randomTile();
    this.grid.falling = tile;
    this.grid.is_merged = false;
    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    tileValue:  this.nextTile,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2:down, 3: left, 4: one step fall
  window.moveObj = this;

  if(direction == 2 && window.trySlideDown) {
    clearTimeout(window.trySlideDown); window.trySlideDown = null;
  }

  if(direction == 4)
      window.autoFall = setTimeout(function(){window.moveObj.move(4);}, window.timeOut);

  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          self.grid.is_merged = true;
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];
          self.grid.falling = merged;
          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  //Keep on decreasing timeout after each
  //movement of falling block.
  window.timeOut = window.timeOut * window.FACTOR;
  if (moved) {
    // if(vector.y == 1)
    //   this.addRandomTile();

    // if (!this.movesAvailable()) {
    //   this.over = true; // Game over!
    // }
   this.actuate();
   if((direction == 1 || direction == 3 || direction == 2) && self.grid.is_merged) {
     window.timeOut = window.timeOut / window.FACTOR;
     clearTimeout(window.trySlideDown);
     window.trySlideDown = setTimeout(function(){ window.moveObj.move(2); }, 200);
   }
  } else {
    if((direction == 2 || direction == 4) && this.grid.falling.y == 0)
      this.over = true; // Game over!
    if(direction == 4 && this.grid.falling.y != 0)
      this.addRandomTile();    
    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
    4: { x: 0, y: 0}     //one step fall
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }
    traversals.y.push(this.size);

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  // if(vector.y == 0) traversals.y = [0]
  if(vector.y == 0) { // && vector.x == 0) {
    traversals.x = [this.grid.falling.x]; 
    traversals.y = [this.grid.falling.y];
  }
  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;
  
  if(vector.y == 0) {
        if(vector.x == 0)vector.y = 1;
        previous = cell; cell = { x: previous.x + vector.x, y: previous.y + vector.y };
        if(this.grid.withinBounds(cell) && this.grid.cellAvailable(cell)) {
        previous = cell; //cell = { x: previous.x + vector.x, y: previous.y + vector.y };          
        if(vector.x == 0)vector.y = 0;
        }
  } else {
    // Progress towards the vector direction until an obstacle is found
    do {
      previous = cell;
      cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
    } while (this.grid.withinBounds(cell) &&
             this.grid.cellAvailable(cell));
  }

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0+1; y < this.size+1; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
