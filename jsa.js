/**********************************************************************************
*
* lib name: jsa (provisional)
* author: Terence Zhong
* email: texvnars@gmail.com
* GitHub: https://github.com/TerenceZ/jsa.git
* Description: This is a simple library for javascript asynchronous programming.
* 
* Functionalities:
*     1. supports automatical callback after satisfying a specific condition.
*        At present, this lib supports the following conditions:
*        1.1. when a timeout is met;
*        1.2. when a function is accomplished;
*        1.3. when an event is triggered;
*        1.4. when an event handler is accomplished;
*        1.5. when some parrallel sub-tasks are accomplished;
*     2. supports chain operations, just like task.then(...).wait(...);
*     3. supports async loop function;
*     4. supports aborting a function;
*     5. supports task manager;
*     6. supports implicit task creation;
*     7. supports arguments, result and exception propagation;
*     7. so on;
* 
* Usage:
*     0. of course, you must include this lib;
*     1. use "var task = [new] jsa.Task()" to create Task,
*        or just use "task = jsa.Task.[then|once|wait|loop]"
*        to create a implicit task;
*     2. use "task.then(function(...) {...})" to add normal
*        action;
*     3. use "task.once(function(...) {...})" to add exception
*        handler;
*     4. use "task.loop(..., ...)" to add async loop action;
*     5. use "task.wait(...[,...,...])" to add wait action;
*     6. use "task.fire(...)" to start the task;
*     7. use "task.abort(...)" to abort the task (including all sub-tasks);
*     8. use "task.status" to check task running status;
*     9. use "task.returnValue" to check return value;
*    10. use "task.exceptInfo" to check exception info;
*    11. use "task.reset()" to reset the task;
*    12. use "jsa.taskManager.abort()" to abort all running tasks;
*    13. use "jsa.taskManager" on console to check task manager status;
* 
* Note:
*     1. You can easily to embrace some [parrallel] sub-tasks, just like this:
*        --------------------------------------------------------------------
*        var task = jsa.Task.wait(500).then(function() {
*          jsa.Task.wait(500).then(function() {
*            console.log('a'); 
*          }).fire();
*          jsa.Task.then(function(s) {
*            jsa.Task.wait(300).then(function() {
*              console.log('b' + s);
*            }).fire();
*          }).fire(10);
*        }).then(function() {
*          console.log('c');
*        }).fire();
*        --------------------------------------------------------------------
*        You can run it to check if the result is "b10 a c".
*        If you want to abort this task, just use "task.abort()" or
*        "jsa.taskManager.abort()" to abort all tasks.
* 
*     2. You can easily to listen the dom events and extend its handler, just 
*        like this:
*        --------------------------------------------------------------------
*        var btn = document.createElement("input");
*        btn.type = "button";
*        btn.value = "Click me!";
*        document.body.appendChild(btn);
*        function go() {
*          jsa.Task.wait(500).then(function() {
*            console.log("hello");
*          }).fire();
*        }
*        var task = jsa.Task.wait(btn, "click", go).then(function() {
*          console.log("hi");
*        }).fire();
*        --------------------------------------------------------------------
*        If you run it and click on the button, you can see the result is 
*        "hello hi"(delayed 500ms).
*        If you click on the button again, you will just see the result is
*        "hello"(delayed 500ms).
*        If you use "task.abort()", you will just see "hello"(delayed 500ms), but 
*        if you use "jsa.taskManager.abort()" after button clicked but before the
*        result shows, you will see nothing (otherwise you can still see "hello").
*        Why?  Because the handler is decorated as a task.
* 
*     3. This lib is open-source, so you can modify it as what you want. But you
*        should reserve the author messages of TerenceZ and this lib's copyright
*        is reserved by TerenceZ.
* 
*     4. Hope you like it!
* 
**********************************************************************************/

(function() {
  var jsa = this.jsa = this.jsa || { // namespace jsa
    extend: function(source, target, override) {
      for (var prop in source) {
        if (!(prop in target) || override)
          target[prop] = source[prop];
      }
    },
    clone: function(source) {
      var obj = {};
      jsa.extend(source, obj);
      return obj;
    }
  };
  
  
  var A_slice = Array.prototype.slice;
  
  var debug = true;
  
  /*********************************************************************************
   * singleton name: taskManager
   * description: use to manage tasks.
   ********************************************************************************/
  var taskManager = jsa.taskManager = function() {
    return {
      // attributes
      id: 0,                  // id counter
      lives: 0,               // living tasks number
      tasks: new Object(),    // all living tasks
      completedTasks: [],     // tasks that have been cleared, [just use to debug]
      status: "idle",         // the task manager status
      context: null,          // the task that is executing
      
      // method
      // to retrieve the available task id
      getId: function() {
      	if (this.id < 0) {
          throw "NoEnoughTaskId: No enough task id to allocate.";
        }
        return this.id++;
      },
      // to abort all tasks
      abort: function() {
        // this.sort();
        var tasks = this.tasks;
        for (var id in tasks) {
          tasks[id].abort();
        }
      },
      // to clear tasks
      clear: function() {
        var lives = this.lives;
        if (lives == 0) {
          this.id = 0;
          this.status = "idle";
          this.context = null;
        }
      },
      // to unregister a task
      unregister: function(task) {
        var id = task.id;
        if (this.tasks[id]) {
          if (debug) this.completedTasks.push(task);
          delete this.tasks[id];
          this.lives--;
        }
      },
      // to register a new task
      register: function(task) {
        var id = task.id;
        if (this.tasks[id])
          throw "(╯‵□′)╯︵┻━Who stands on this position━┻ ---> this guy: " + this.tasks[id];
        this.tasks[id] = task;
        this.lives++;
      },
      // to update the task manager's status
      update: function(event) {
        var type = event.type,
            id = event.id,
            self = this,
            context = self.context,
            target = self.tasks[id];
        switch(type) {
          case "focus": // there is a task requesting to execute
            // if there is a task executing and the requesting task is a sub-task of the current task
            if (context && context.focused && context !== target) {
              // if this is the sub-task's first execution, bind it to the current task
              if (target.isFirstFocus) {
                context.observableList.push(target);
                target.observer = context;
              }
              // hang up the current task, so the requesting task can execute
              context.hang();
            }
            // set the requesting task as the executing task
            target.isFirstFocus = false;
            self.context = target;
            self.status = "busy";
            break;
          case "blur": // there is a task requesting to let other tasks to execute
            // if the requesting task is executing, switch the context to its observer
            if (target === context || !context) {
              self.context = target && target.observer;
              self.status = "idle";
            }
            break;
          case "complete": // there is a task is completed
            self.unregister(target);
            if (this.lives == 0) this.clear();
            break;
        }
      }
    };
  }();
  
  
  /*********************************************************************************
   * class name: task
   * description: use to execute some ordered action objects.
   ********************************************************************************/
  var Task = jsa.Task = function(fn) {
    return (this instanceof Task) ? this.init(fn) : new Task(fn);
  };
  
  jsa.extend({ // extend the task
    status: ["idle", "hanging", "firing", "failure", "success"], // the task status list
    get: function(obj) {
      return (obj instanceof Task) ? obj : new Task();
    },
    basic: { // default action object
      // default normal action
      normal: function(args) {
        return args;
      },
      // default exception handler
      except: function(e) { 
        throw e;
      }
    }
  }, Task);
  
  Task.prototype = {
    constructor: Task,
    init: function(fn) {
      if (this.id) this.abort(); // if id exists, abort the task first
      else this.id = taskManager.getId();
      this.timeoutId = null,    // use to abort task
      this.isFirstFocus = true, // use to indicate the task is new
      this.status = "idle";     // use to indicate the task status
      this.waitingList = [];    // the action objects waiting to take
      this.returnValue = null;  // use to save the latest return value
      this.exceptInfo = null;   // use to save the exception info
      this.argsCache = [];      // use to store the sub-tasks' return values
      this.focused = false;     // use to indicate if the task is executing
      this.observer = null;     // the task's observer
      this.observableList = []; // the tasks that this task is observing
      // for debug
      if (debug) {
        this.completedList = this.completedList ? this.completedList : [];
      }
      try {
        taskManager.register(this); // try to register
      } catch(e) {
        this.id = taskManager.getId(); // if failed get a new id and try to register again
        taskManager.register(this);
      }
      // there is a function as input, so append it to the waitingList
      if (typeof fn === "function") this.then(fn);
      return this;
    },
    // public methods
    // to add new action object
    add: function(stat, fn) {
      if (this.completed()) this.init();
      var obj = jsa.clone(Task.basic);
      if (typeof fn === "function") obj[stat] = fn;
      this.waitingList.push(obj);
      return this;
    },
    // to add new action object with specific normal action
    then: function(fn) {
      var self = Task.get(this);
      return self.add("normal", fn);
    },
    // to add new action object with specific exception handler
    once: function(fn) {
      var self = Task.get(this);
      return self.add("except", fn);
    },
    // to add new action object with specific condition
    wait: function(obj, event, fn) {
      var self = Task.get(this);
      // the condition is when the obj function is accomplished
      if (typeof obj === "function") {
        self.waitingList.push(Task.makeMonitored(obj));
      // the condtion is when the timeout is met
      } else if (typeof obj === "number") {
        var timeout = ~~obj;
        if (timeout <= 0) return self;
        if (self.completed()) self.init();
        self.waitingList.push(timeout);
      // the condition is when the dom's event is triggered, or
      // when the event handler is accomplished.
      // note that the context of the listener will miss [fix it]
      } else if (obj.nodeType) {
        // make the fn agented by mfn and decorate it as a task
        var mfn = Task.makeMonitored(fn ? fn : function() { });
        self.waitingList.push(mfn);
        // add mfn as the event listener
        if (obj.addEventListener) {
          obj.addEventListener(event, mfn);
        } else if (obj.attachEvent) {
          obj.attachEvent("on" + event, mfn);
        } else {
          obj["on" + event] = mfn;
        }
      }
      return self;
    },
    // to make the obj agented and decorate it as a task
    makeMonitored: function(obj) {
      if (typeof obj !== "function") return;
      var origin = obj, nobj = obj;
      if (!nobj.origin) { // if it hasn't been agented
        // agent mode
        nobj = function() {
          var self = arguments.callee;
          var args = A_slice.call(arguments);
          // decorate it as a task
          var task = Task.then(function() {
            return self.origin.apply(null, args);
          }).then(function(result) {
            var observers = self.observer;
            for (var i = 0, len = observers.length; i < len; ++i) {
              observers[i].update({
                id: -1,
                type: "normal",
                result: result
              });
            }
            self.observer = [];
            // because update the observers will maybe make the task hung,
            // it means that re-firing it is nessesary.
            task.fire(result);
          }).fire();
        };
        // save the origin's info
        nobj.origin = origin;
        nobj.observer = [];
      }
      return nobj;
    },
    // to abort the task
    abort: function(msg) {
      var self = this;
      if (self.completed()) return null;
      if (self.timeoutId !== null) // the task can be aborted
        clearTimeout(self.timeoutId);
      self.blur();
      var wList = self.waitingList; // store the un-accomplished action objects
      // force to accomplish the task
      this.complete("except", ["Abort: abort by task " + self.id + ", message: " + msg]);
      return wList; // return the un-accomplished action objects
    },
    // to reset the task
    reset: function() {
      return this.init();
    },
    // to indicate if the task is completed
    completed: function() {
      return (this.status === "success" || this.status === "failure");
    },
    // to start the method
    fire: function() {
      if (!this.completed()) {
        this.status = "firing";
        return this._fire("normal", A_slice.call(arguments));
      }
    },
    // to take the fn repeatedly[can cyclically] until the specific condition is achieved
    loop: function(env, fn) {
      var self = Task.get(this);
      if (self.completed()) self.init();
      var init, condition, increment, delta, cond, inc;
      if (typeof env === "number") { // the number of cycles
        init = 0;
        condition = env;
        increment = 1;
        delta = 0;
      } else {
        init      = env[0] || env.init  || 0; // init value
        condition = env[1] || env.cond  || 0; // condition function or bound
        increment = env[2] || env.inc   || 0; // increment function or number
        delta     = env[3] || env.delta || 0; // cycle alternation
      }
      if (typeof condition === "number") { // condition bound
        if (typeof increment === "number" && increment < 0) {
          // upper bound
          cond = function(i) {
            return (i > condition);
          };
        } else {
          // lower bound
          cond = function(i) {
            return (i < condition);
          };
        }
      } else { // condition function
        cond = condition;
      }
      if (typeof increment === "number") { // increment number
        inc = function(i) {
          return (i + increment);
        };
      } else { // increment function
        inc = increment;
      }
      return self.then(function() {
        // decorate the loop as a task
        var task = new Task();
        // this info used to indicate this task is for loop
        task.specific = "loop for task " + self.id;
        task.then(function() {
          if (cond(init)) {
            fn(init);
            init = inc(init);
            task.wait(delta).then(arguments.callee);
          }
        }).fire();
      });
    },
    // private methods, don't use them in plubic.
    // to hang the task up
    hang: function() {
      var f = this.focused; // save the focused status,
      this.blur();          // bacause blur() will change it
      this.focused = f;
      this.status = "hanging";
      return this;
    },
    // to focus the task
    focus: function() {
      this.focused = true;
      // to notify the task manager let this task execute
      taskManager.update({
        id: this.id,
        type: "focus"
      });
    },
    // to blur the task
    blur: function() {
      this.focused = false;
      // to notify the task manager let other tasks execute
      taskManager.update({
        id: this.id,
        type: "blur"
      });
    },
    // to make the task completed
    complete: function(type, args) {
      if (this.completed()) return this;
      var self = this;
      var result = self.returnValue;
      self.waitingList = [];
      self.firing = null;
      self.blur();
      // all action objects have been executed
      if (type === "normal") {
        self.exceptInfo = null;
        self.status = "success";
      }
      // the task is aborted or has catched an exception
      else {
        // to abort all sub-tasks
        self.update({
          id: self.id,
          type: type
        });
        self.status = "failure";
        self.exceptInfo = result = args;
      }
      // to notify the task manager this task is completed
      taskManager.update({
        id: self.id,
        type: "complete"
      });
      // to notify the task's observer this task is completed
      if (self.observer) {
        self.observer.update({
          id: self.id,
          type: type,
          args: args,
          result: result
        });
      }
      return self;
    },
    // to update the task's status
    update: function(event) {
      var id = event.id,
          type = event.type,
          args = event.args,
          result = event.result,
          self = this,
          list = self.observableList;
      if (id !== self.id) {
          self.argsCache.push(result);
      }
      switch (type) {
        case "normal": // the sub-task is completed normally
          // all sub-tasks are completed
          // if focused is true, it means that the firing action object in this task
          // hasn't been accomplished, so maybe there are some sub-tasks that haven't
          // met, it means that just go on until the firing action object is accomplished
          if (!self.focused && list.length == self.argsCache.length) {
            var argsCache = self.argsCache;
            self.observableList = []; // clear sub-tasks list
            self.argsCache = []; // clear sub-tasks' args list
            var flag = false; // to indicate if all sub-tasks havn't return value
            for (var i = 0, len = argsCache.length; i < len; ++i)
              if (typeof argsCache[i] !== "undefined") {
                flag = true;
                break;
              }
            // if true, let the args[latest input args] or returnValue[latest return value]
            // as the re-fire arguments
            if (!flag) argsCache = args ? args.length ? args : [self.returnValue] : argsCache;
            self.fire.apply(self, argsCache);  // re-fire the task
          }
          break;
        case "except": // sub-task is aborted or throwed an exception
          // abort all un-accomplished sub-tasks
          for (var i = 0, len = list.length; i < len; ++i) {
            var task = list[i];
            if (task.completed && !task.completed()) {
              task.observer = null; // prevent dead cycles
              task.abort();
              task.observer = self; // restore the info
            }
          }
          // clear
          self.observableList = [];
          self.argsCache = [];
          // if this function isn't call by the task itself
          if (id !== self.id) {
            // re-fire it and propagate the except info forward to handle
            self.focus();
            self.status = "firing";
            self._fire("except", ["SubtaskException: subtask " + id + " has exception: " + args]);
          }
          break;
      }
    },
    // the real fire core function
    _fire: function(stat, args) {
      if (this.status !== "firing") return this;
      var self = this;
      var type = "normal",
          obj = self.waitingList.shift(), // get the next action object
          result;
      self.focus(); // focus
      if (obj) { // if the object is available
        if (debug) self.completedList.push(obj); // for debug
        if (typeof obj === "number") { // handle the timeout condition object
          self.blur();
          if (stat === "except") obj = 0;
          self.timeoutId = setTimeout(function() {
            self.status = "firing";
            self._fire(stat, args);
          }, obj);
        } else if (typeof obj === "function") { // handle the function agent[event listener] object
          if (obj.observer) { // the object is agented
            obj.observer.push(self);
            // hang the task up without saving "focused", because we don't need to bind the obj to any tasks
            self.blur();
            self.status = "hanging"; 
            self.observableList.push(-1); // the agent object's id is -1, because the tasks' id would not be set to -1
          } else { // otherwise, abort the task to avoid dead cycles
            self.abort("Cannot listen \"" + obj + "\", please make it monitored by calling jsa.Task.makeMonitored(fn) first");
          }
        } else { // handle the normal action object
          try {
            // execute the action object's stat action
            result = self.returnValue = obj[stat].apply(self, args);
          } catch (e) {
            // an exception is throwed, save it and propagate it forward until handled
            type = "except";
            self.exceptInfo = result = e;
          }
          self.blur(); // blur
          if (result) args = [result]; // if the action has return value, make it as the next action's arguments
          if (self.argsCache.length !== self.observableList.length) { // if there are un-accomplished sub-tasks
            self.hang(); // hang the task up
          } else if (self.argsCache.length > 0) { // if there are sub-tasks and all of them are accomplished
            self.timeoutId = setTimeout(function() { // update the task's status and continue to execute
              self.update({id: self.id, type: type, args: args});
            }, 0);
          } else { // there are no tasks, so just go on
            self.timeoutId = setTimeout(function() {
              self._fire(type, args);
            }, 0);
          }
        }
      } else { // there are no waiting action objects, so make the task completed
        return this.complete(stat, args);
      }
      return self;
    }
  };
  
  // make the Task is easier to use by making the followed methods as the Task's own methods
  "once then loop wait makeMonitored".replace(/\S+/g, function(item) {
    Task[item] = Task.prototype[item];
  });
  
})();
