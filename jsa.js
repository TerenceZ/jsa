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
		//------------------------------------------------------------
		// 私有变量
		//------------------------------------------------------------
		var maxAvailable = 10, // 最大的有效任务数
				idPool = null, // 任务ID分配池
				idleTasks = new Array(maxAvailable), // 待执行的任务
				completedTasks = []; // 已回收的任务列表
		
		//------------------------------------------------------------
		// 私有方法
		//------------------------------------------------------------
		var nextAvailableId = function() { // 获取下一个有效的任务
			if (!idPool) { // 对idPool初始化
				idPool = new Array(maxAvailable);
				for (var i = 0; i < maxAvailable; ++i)
					idPool[i] = i;
			}
			if (idPool.length > 0) // 有有效id可分配
				return idPool.shift();
			else
				throw "NoEnoughTaskId: No enough task id to allocate.";
		};
		
		var removeTask = function(taskId) {
			if (typeof taskId !== "number")
				throw "InvalidTaskId: Task id is invalid.";
			var task = idleTasks[taskId];
			if (task) {
				if (!task.completed()) { // 若任务未完成，尝试终止
					task.abort();
				}
				idPool.push(task.id); // 回收任务id
				idleTasks[taskId] = null;
				completedTasks.push(task);
			}
		};

		//------------------------------------------------------------
		// 公有属性与方法
		//------------------------------------------------------------
		return {
			// 属性
			status: "idle", // 任务管理器状态
			context: null, // 当前正在执行的任务
			// 方法
			getTask: function(id) { // 获取任务/新任务
				if (typeof id !== "number") {
					id = nextAvailableId();
					var task = new Task(id);
					idleTasks[id] = task;
					return task;
				}
				return idleTasks[id];
			},
			update: function(event) { // 状态更新函数
				var type = event.type,
						id = event.id,
						self = this,
						context = self.context,
						target = idleTasks[id];
				switch(type) {
					case "wait": // 若当前任务请求挂起，则设置当前正在执行的任务为空
						if (context === target)
							self.context = target.observer;
						break;
					case "fire": // 若有任务请求执行
						if (context && context.firing && context !== target) { // 已有任务正在执行，且target处于另一个任务（context）中
							// 构建两者关系
							if (context.observableList.indexOf(target.id) < 0) {
								context.observableList.push(target.id);
								target.observer = context;
							}
							// 挂起context
							context.hang();
						}
						self.context = target;
						self.status = "busy";
						break;
					case "hang":
					case "abort":
						// 1. 若context为空，则没有任务在执行（或者正在挂起）
						// 2. 当前任务请求暂停
						// 这两种情况都能重置任务管理器的状态
						if (!context || target === context) {
							self.context = target && target.observer;
							self.status = "idle";
						}
						break;
					case "complete": // 有任务完成，执行清理
						if (!context || context === target) {
							self.context = target && target.observer;
							self.status = "idle";
						}
						removeTask(id);
						break;
				}
			}
		};
	}();
	
	
	/***************************************************************
	======================== 异步任务模块 =============================
	****************************************************************/
	var Task = function(id) {
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
			this.timeoutId = null,
			// 分支主要用于确认是否属于初始化行为
			this.id = (typeof id === "number") ? id : this.id;
			this.status = "idle";     // 任务默认状况下为idle
			this.waitingList = [];    // 待执行的动作列表
			this.completedList = [];  // 已完成的动作列表
			this.returnValue = null;  // 保存返回结果
			this.argsCache = [];      // 存储子任务的返回结果
			this.lastArgs = null;     // 保存上次的参数
			this.firing = null;       // 当前正在执行的对象，同时用于表明任务是否处于执行阶段（为null则为切换阶段）
			this.observer = null;     // 观察者
			this.observableList = [];  // 正在观察的任务
			return this;
		},
		reset: function() { // 重置函数
			this.abort(); // 中断任务
			return this.init(); // 重新初始化
		},
		add: function(stat, fn) { // 添加任务处理动作
			if (this.completed())
				throw "InvalidOperation: Cannot add any operations to completed task.";
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
				throw "InvalidOperation: Cannot add any operations to completed task.";
			var self = this;
			self.waitingList.push(~~timeout);
			return self;
		},
		hang: function() {
			taskManager.update({ // 通知任务管理器此任务已挂起（不包含子任务）
				id: this.id,
				type: "hang"
			});
			this.status = "hanging";
			return this;
		},
		abort: function() {
			if (this.completed()) return null;
			if (this.timeoutId !== null) // 中断任务
				clearTimeout(this.timeoutId);
			taskManager.update({ // 通知任务管理器此任务已中断
				id: this.id,
				type: "abort"
			});
			var wList = this.waitingList; // 保存尚未完成的列表返回
			this.complete("except", ["Abort: abort by task " + this.id]); // 强制完成任务
			return wList;
		},
		complete: function(type, args) {
			if (this.completed()) return null;
			// 设置完成状态下的数据状态
			var self = this;
			self.waitingList = [];
			self.firing = null;
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
					if (!self.firing && list.length == self.argsCache.length) { // 当前行动中的所有子任务已完成（firing为空表明当前行动结束）
						var argsCache = self.argsCache;
						self.observableList = []; // 清空子任务列表
						self.argsCache = []; // 清空子任务参数列表
						self.fire.apply(self, argsCache); // 重新执行此任务
					}
					break;
				case "except": // 子任务存在异常
					// 终止所有子任务
					for (var i = 0, len = list.length; i < len; ++i) {
						var task = taskManager.getTask(list[i]);
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
						taskManager.update({
							id: self.id,
							type: "fire",
						});
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
			lastArgs = args;
			if (obj) {
				self.firing = obj;
				self.completedList.push(obj);
				if (typeof obj === "number") { // 处理wait
					taskManager.update({ // 通知任务管理器挂起此任务
						id: self.id,
						type: "wait"
					});
					self.firing = null;
					self.timeoutId = setTimeout(function() {
						taskManager.update({ // 通知任务管理器拾起此任务
							id: self.id,
							type: "fire"
						});
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
					self.firing = null;
					lastArgs = args; // 执行对象的行为当中可能改变了lastArgs，因此需要修正
					if (result) args = [result]; // 若存在返回值，将result作为下一个对象的执行参数
					if (self.argsCache.length !== self.observableList.length) {// 还有子任务未完成
						self.hang();
					} else if (self.argsCache.length > 0) { // 含子任务且已完成
						self.timeoutId = setTimeout(function() {
							self.update({id: self.id, type: type, args: args});
						}, 0);
					} else { // 不含子任务
						//self.timeoutId = setTimeout(function() {
							self._fire(type, args);
						//}, 0);
					}
				}
			} else {
				return this.complete(stat, args);
			}
			return self;
		},
/*		normalize: function(args) {
			return (args instanceof Array) ? args : [args];
		},*/
		fire: function() {
			var args = A_slice(arguments);
			if (this.status !== "completed") {
				if (this.status === "pause") { // 若当前状态是暂停，则根据之前保存的数据恢复操作
					if (args.length == 0 && this.lastArgs && this.lastArgs.length > 0) {
						args = lastArgs;
					}
				}
				// 通知任务管理器执行此任务
				taskManager.update({
					id: this.id,
					type: "fire",
					args: args
				});
				this.status = "firing";
				this._fire("normal", args);
			}
		}
	};
	
	"wait then once".replace(/\w+/g, function(method) {
		Task[method] = Task.prototype[method];
	});
})();
