jsa (provisional)
======================================
    author: Terence Zhong
    email: texvnars@gmail.com
    GitHub: https://github.com/TerenceZ/jsa.git
    Description: This is a simple library for javascript asynchronous programming.
 
 Functionalities:
--------------------------------------
1. supports automatical callback after satisfying a specific condition.At present, this lib supports the following conditions:
    1. when a timeout is met;
    2. when a function is accomplished;
    3. when an event is triggered;
    4. when an event handler is accomplished;
    5. when some parrallel sub-tasks are accomplished;
2. supports chain operations, just like task.then(...).wait(...);
3. supports async loop function;
4. supports aborting a function;
5. supports task manager;
6. supports implicit task creation;
7. supports arguments, result and exception propagation;
8. so on;
 
Usage:
--------------------------------------

1. of course, you must include this lib;
2. use "var task = [new] jsa.Task()" to create Task,
   or just use "task = jsa.Task.[then|once|wait|loop]"
   to create a implicit task;
3. use "task.then(function(...) {...})" to add normal
   action;
4. use "task.once(function(...) {...})" to add exception
   handler;
5. use "task.loop(..., ...)" to add async loop action;
6. use "task.wait(...[,...,...])" to add wait action;
7. use "task.fire(...)" to start the task;
8. use "task.abort(...)" to abort the task (including all sub-tasks);
9. use "task.status" to check task running status;
10. use "task.returnValue" to check return value;
11. use "task.exceptInfo" to check exception info;
12. use "task.reset()" to reset the task;
13. use "jsa.taskManager.abort()" to abort all running tasks;
14. use "jsa.taskManager" on console to check task manager status;
 
Note:
--------------------------------------

1. You can easily to embrace some [parrallel] sub-tasks, just like this:
```javascript
        var task = jsa.Task.wait(500).then(function() {
          jsa.Task.wait(500).then(function() {
            console.log('a'); 
          }).fire();
          jsa.Task.then(function(s) {
            jsa.Task.wait(300).then(function() {
              console.log('b' + s);
            }).fire();
          }).fire(10);
        }).then(function() {
          console.log('c');
        }).fire();
```
You can run it to check if the result is "b10 a c".
If you want to abort this task, just use "task.abort()" or "jsa.taskManager.abort()" to abort all tasks.
 
2. You can easily to listen the dom events and extend its handler, just like this:
```javascript
        var btn = document.createElement("input");
        btn.type = "button";
        btn.value = "Click me!";
        document.body.appendChild(btn);
        function go() {
          jsa.Task.wait(500).then(function() {
            console.log("hello");
          }).fire();
        }
        var task = jsa.Task.wait(btn, "click", go).then(function() {
          console.log("hi");
        }).fire();
```
If you run it and click on the button, you can see the result is "hello hi"(delayed 500ms).
If you click on the button again, you will just see the result is "hello"(delayed 500ms).
If you use "task.abort()", you will just see "hello"(delayed 500ms), but if you use "jsa.taskManager.abort()" after
button clicked but before the result shows, you will see nothing (otherwise you can still see "hello").
Why?  Because the handler is decorated as a task.
 
3. This lib is open-source, so you can modify it as what you want. But you should reserve the author messages 
   of TerenceZ and this lib's copyright is reserved by TerenceZ.
4. Hope you like it!
 
