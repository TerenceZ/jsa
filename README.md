jsa
===
    库   名：jsa（暂定）
    作   者：钟华锋（TerenceZ）
    邮   箱：texvnars@gmail.com
    博   客：http://www.cnblogs.com/texvnars/archive/2013/05/31/3110583.html

    用   途：用于javascript的异步编程，此库除了基本的异步编程功能外，还支持并行操作（伪）、嵌套式异步编程（大雾）等。
    用   法：
      1、通过var task = [new] jsa.Task()创建任务，另外，直接使用jsa.Task.[then|once|wait|loop]会隐式创建任务；
      2、通过task.then(function(...) {...})添加normal行为；
      3、通过task.once(function(e) {...})添加异常处理（except）行为；
      4、通过task.loop(..., ..., ..., ...)添加异步循环行为；
      5、通过fire(...)执行任务；
      6、通过task.status可以查看任务的执行状态；
      7、通过task.returnValue可以查看任务执行过程中最近的返回值；
      8、通过task.exceptInfo可以查看任务failure时的异常原因；
      9、通过task.reset()可以重置任务；
     10、通过task.abort()终止任务（包括所有子任务）；
    说   明：
      1、支持嵌套式的异步编程，例如
        task.then(function(...) {
          task2.wait(...).then(function(...) {
            task3.then(...).fire(...);
          }).fire(...);
        }).fire(...);
      2、支持并行操作，例如
        task.then(function() {
          task2.wait(1000).then(...).fire();
            task3.then(...).once(...).wait(...).fire(...);
        }.then(...).once(...).fire();
      3、若子任务抛出异常（abort也会抛出异常），则会抛到上层任务，若上层没有once处理，则继续到上层，直至抛到window执
        行环境下；
      4、task.loop([init, condition, increment], fn)中的init、condition、increment可以为数字，而fn必须为函数对象,若第
        一个参数不为数组而是数字，则代表循环次数；
      5、当任务完成后继续then或once会自动重置任务；
