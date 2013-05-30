/*****************************************************************
* 库   名：jsa（暂定）
* 作   者：钟华锋（TerenceZ）
* 邮   箱：texvnars@gmail.com
* GitHub: https://github.com/TerenceZ/jsa.git
* 用   途：用于javascript的异步编程，此库除了基本的异步编程功能外，还支持并行操
*      作（伪）、嵌套式异步编程（大雾）等。
* 用   法：1、通过var task = [new] jsa.Task()创建任务；
*         2、通过task.then(function(...) {...})添加normal行为；
*         3、通过task.once(function(e) {...})添加异常处理（except）行为；
*         4、通过task.loop(..., ..., ..., ...)添加异步循环行为；
*         5、通过fire(...)执行任务；
*         6、通过task.status可以查看任务的执行状态；
*         7、通过task.returnValue可以查看任务的最近的行为返回值；
*         8、通过task.reset()可以重置任务；
*         9、通过task.abort()终止任务（包括所有子任务）；
* 说   明：1、支持嵌套式的异步编程，例如
*           task.then(function(...) {
*             task2.wait(...).then(function(...) {
*               task3.then(...).fire(...);
*             }).fire(...);
*           }).fire(...);
*         2、支持并行操作，例如
*           task.then(function() {
*             task2.wait(1000).then(...).fire();
*             task3.then(...).once(...).wait(...).fire(...);
*           }.then(...).once(...).fire();
*         3、若子任务抛出异常（abort也会抛出异常），则会抛到上层任务，若
*            上层没有once处理，则继续到上层，直至抛到window执行环境下；
*         4、task.loop(init, condition, increment, fn)中的init、
*            condition、increment可以为数字，而fn必须为函数对象；
*         5、当任务完成后继续then或once会自动重置任务；
*         6、若需要修改此文件，请保留原有的作者信息；
******************************************************************/

(function() {
	var jsa = this.jsa = this.jsa || { // 命名空间jsa
		extend: function(source, target, override) { // 扩展函数
			for (var prop in source) {
				if (override || !(prop in target))
					target[prop] = source[prop];
			}
		},
		clone: function(source) { // 克隆函数
			var obj = {};
			jsa.extend(source, obj);
			return obj;
		}
	};
	
	// 缓存部分常用方法
	var A_concat = Array.prototype.concat.call.bind(Array.prototype.concat);
	var A_slice = Array.prototype.slice.call.bind(Array.prototype.slice);
	
	/***************************************************************
	==================== 异步任管理器务模块 :单例 ======================
	****************************************************************/
	var taskManager = jsa.taskManager = function() {
		return {
			// 属性
			maxAvailable: 10, // 最大的有效任务数
			idPool: null, // 任务ID分配池
			idleTasks: new Array(this.maxAvailable), // 待执行的任务
			completedTasks: [], // 已回收的任务列表
			status: "idle", // 任务管理器状态
			context: null, // 当前正在执行的任务
			// 方法
			getId: function() { // 获取下一个有效的任务
				if (!this.idPool) { // 对idPool初始化
					this.idPool = new Array(this.maxAvailable);
					for (var i = 0, len = this.maxAvailable; i < len; ++i)
						this.idPool[i] = i;
				}
				if (this.idPool.length > 0) // 有有效id可分配
					return this.idPool.shift();
				else
					throw "NoEnoughTaskId: No enough task id to allocate.";
			},
			unregister: function(taskId) { // 注销任务
				if (typeof taskId !== "number")
					throw "InvalidTaskId: Task id is invalid.";
				var task = this.idleTasks[taskId];
				if (task) {
					if (!task.completed()) { // 若任务未完成，尝试终止
						task.abort();
					}
					this.idPool.push(task.id); // 回收任务id
					this.idleTasks[taskId] = null;
					this.completedTasks.push(task);
				}
			},
			register: function(task) { // 注册新任务
				var id = task.id;
				if (!this.idleTasks[id])
					this.idleTasks[id] = task;
				else
					throw "(╯‵□′)╯︵┻━Who stands on this position━┻ ---> this guy: " + this.idleTasks[id];
			},
			get: function(id) {
				if (typeof id === "number")
					return this.idleTasks[id];
				return null;
			},
			update: function(event) { // 状态更新函数
				var type = event.type,
						id = event.id,
						self = this,
						context = self.context,
						target = self.idleTasks[id];
				switch(type) {
					case "focus": // 若有任务请求执行
						if (context && context.focused && context !== target) { // 已有任务正在执行，且target处于另一个任务（context）中
							// 构建两者关系
							if (!target.observer) {
								context.observableList.push(target.id);
								target.observer = context;
							}
							// 挂起context
							context.hang();
						}
						self.context = target;
						self.status = "busy";
						break;
					case "blur": // 失焦
						if (!context || target === context) {
							self.context = target && target.observer;
							self.status = "idle";
						}
						break;
					case "complete": // 有任务完成，执行清理
						self.unregister(id);
						break;
				}
			}
		};
	}();
	
	
	/***************************************************************
	======================== 异步任务模块 =============================
	****************************************************************/
	var Task = jsa.Task = function(id) {
		return (this instanceof Task) ? this.init(id) : new Task(id);
	};
	
	jsa.extend({ // 扩展Task方法
		status: ["idle", "hanging", "firing", "success", "failure"], // 任务状态列表
		basic: { // 默认任务处理对象
			normal: function(args) { // 正常状态下的默认处理方法
				return args;
			},
			except: function(e) {  // 异常状态下的默认处理方法
				throw e;
			}
		}
	}, Task);
	
	Task.prototype = {
		constructor: Task,
		init: function(id) {
			if (this.id) this.abort();// 若已存在id，则尝试终止
			else this.id = taskManager.getId();
			this.timeoutId = null,
			this.status = "idle";     // 任务默认状况下为idle
			this.waitingList = [];    // 待执行的动作列表
			this.returnValue = null;  // 保存返回结果
			this.argsCache = [];      // 存储子任务的返回结果
			this.lastArgs = null;     // 保存上次的参数
			this.focused = false;     // true: 正在执行；false: 正在切换/挂起
			this.observer = null;     // 观察者
			this.observableList = []; // 正在观察的任务
			this.completedList = this.completedList ? this.completedList : [];  // 已完成的动作列表
			try {
				taskManager.register(this); // 尝试注册
			} catch(e) {
				this.id = taskManager.getId(); // 若失败则重新获取新id注册
				taskManager.register(this);
			}
			return this;
		},
		// 基本操作
		add: function(stat, fn) { // 添加任务处理动作
			if (this.completed())
				this.init();
			var obj = jsa.clone(Task.basic); // 生成任务处理对象
			if (typeof fn === "function") // 绑定动作
				obj[stat] = fn;
			this.waitingList.push(obj);
			return this;
		},
		then: function(fn) {
			return this.add("normal", fn);
		},
		once: function(fn) {
			return this.add("except", fn);
		},
		wait: function(timeout) {
			if (this.completed())
				this.init();
			var self = this;
			self.waitingList.push(~~timeout);
			return self;
		},
		abort: function() {
			if (this.completed()) return null;
			if (this.timeoutId !== null) // 中断任务
				clearTimeout(this.timeoutId);
			this.blur();
			var wList = this.waitingList; // 保存尚未完成的列表返回
			this.complete("except", ["Abort: abort by task " + this.id]); // 强制完成任务
			return wList;
		},
		reset: function() {
			return this.init();
		},
		// 内部操作
		hang: function() {
			var f = this.focused; // 挂起时需保存focused状态，因为可能在执行子任务
			this.blur();          // 而blur会导致focused变为false
			this.focused = f;
			this.status = "hanging";
			return this;
		},
		focus: function() {
			this.focused = true;
			taskManager.update({
				id: this.id,
				type: "focus"
			});
		},
		blur: function() {
			this.focused = false;
			taskManager.update({
				id: this.id,
				type: "blur"
			});
		},
		complete: function(type, args) {
			if (this.completed()) return null;
			// 设置完成状态下的数据状态
			var self = this;
			self.waitingList = [];
			self.firing = null;
			self.blur();
			if (type === "normal") self.status = "success";
			else {
				// 强制中断所有子任务
				self.update({
					id: self.id,
					type: type
				});
				self.status = "failure";
				self.returnValue = args;
			}
			taskManager.update({ // 通知任务管理器此任务已完成
				id: self.id,
				type: "complete"
			});
			// 存在观察者在观察此任务
			if (self.observer) {
				// 获取执行结果
				var result = self.returnValue;
				// 通知观察者已此任务已执行完毕
				self.observer.update({
					id: self.id,
					type: type,
					args: args,
					result: result
				});
			}
			return self;
		},
		completed: function() {
			return (this.status === "success" || 
							this.status === "failure");
		},
		update: function(event) {
			var id = event.id,
					type = event.type,
					args = event.args,
					result = event.result,
					self = this,
					list = self.observableList,
					index = list.indexOf(id);
			if (id !== self.id) {
					self.argsCache.push(result);
			}
			switch (type) {
				case "normal": // 子任务正常完成
					if (!self.focused && list.length == self.argsCache.length) { // 当前行动中的所有子任务已完成（firing为空表明当前行动结束）
						var argsCache = self.argsCache;
						self.observableList = []; // 清空子任务列表
						self.argsCache = []; // 清空子任务参数列表
						self.fire.apply(self, argsCache); // 重新执行此任务
					}
					break;
				case "except": // 子任务存在异常
					// 终止所有子任务
					for (var i = 0, len = list.length; i < len; ++i) {
						var task = taskManager.get(list[i]);
						if (task) { // 跳过已完成的任务
							task.observer = null; // 防止重复终止子任务
							task.abort();
							task.observer = self; // 恢复子任务信息
						}
					}
					self.observableList = [];
					self.argsCache = [];
					// 若两者相等，说明是任务自身调用来终止所有子任务
					if (id !== self.id) {
						// 继续执行任务（假设存在异常处理 ）
						self.focus();
						self.status = "firing";
						self._fire("except", ["SubtaskException: subtask " + id + " has exception: " + args]);
					}
					break;
			}
		},
		_fire: function(stat, args) {
			if (this.status !== "firing") return this;
			var self = this;
			var type = "normal",
			    obj = self.waitingList.shift(),
					result;
			self.focus();
			if (obj) {
				self.completedList.push(obj);
				if (typeof obj === "number") { // 处理wait
					self.blur();
					self.timeoutId = setTimeout(function() {
						self.focus();
						self.status = "firing";
						self._fire(stat, args);
					}, obj);
				} else { // 处理一般的串行
					try {
						// 执行对象的行为
						result = self.returnValue = obj[stat].apply(self, args);
					} catch (e) {
						type = "except";
						result = e;
					}
					self.blur();
					if (result) args = [result]; // 若存在返回值，将result作为下一个对象的执行参数
					if (self.argsCache.length !== self.observableList.length) {// 还有子任务未完成
						self.hang();
					} else if (self.argsCache.length > 0) { // 含子任务且已完成
						self.timeoutId = setTimeout(function() {
							self.update({id: self.id, type: type, args: args});
						}, 0);
					} else { // 不含子任务
						self.timeoutId = setTimeout(function() {
							self._fire(type, args);
						}, 0);
					}
				}
			} else {
				return this.complete(stat, args);
			}
			return self;
		},
		fire: function() {
			if (!this.completed()) {
				this.status = "firing";
				return this._fire("normal", A_slice(arguments));
			}
			return this;
		},
		loop: function(init, condition, increment, fn) {
			if (this.completed()) return this;
			var cond = condition,
					inc = increment,
					self = this;
			if (typeof init !== "number") init = 0;
			if (typeof condition === "number") {
				var cond = function(i) {
					return (i < condition);
				};
			}
			if (typeof increment === "number") {
				var inc = function(i) {
					return (i + increment);
				};
			}
			return self.then(function() {
				// 创建循环用的子任务
				var task = new Task();
				task.then(function(a) {
					if (cond(init)) {
						var result = fn(init, a);
						init = inc(init);
						task.then(arguments.callee);
					}
					return result;
				}).fire();
			});
		}
	};
})();
