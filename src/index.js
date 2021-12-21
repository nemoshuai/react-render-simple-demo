/** @jsxRuntime classic */
function createElement(type, props, ...children) {
  const targetType = isClass(type) ? 'CLASS_COMPONENT' : typeof type === 'function' ? 'FUNCTION_COMPONENT' : type;
  return {
    type: targetType,
    props: {
      ...props,
      children: targetType === 'CLASS_COMPONENT' ? [new type().render()] : targetType === 'FUNCTION_COMPONENT' ? [type()] : children.map((child => typeof child === 'object' ?  child : createTextElement(child)))
    }
  }
}

function createTextElement(child) {
  return {
    type: 'TEXT_ELEMENT',
    props: {
      nodeValue: child,
      children: []
    }
  }
}

function createDom(fiber) {
  const dom = fiber.type === 'TEXT_ELEMENT' ? document.createTextNode('') : document.createElement(fiber.type);
  updateDom(dom, {}, fiber.props)

  return dom
}

const isClass = (target) => target.toString().indexOf('class') !== -1;

let currentRoot = null; // 上一次提交的fiber树根节点 则当前更新前的状态
let wipRoot = null; // 根节点引用
let deletions = []; // 由于新的fiber中没有删除的节点，所以需要保留旧fiber的节点来删除
let nextUnitOfWork = null; // 下一个工作单元

function workLoop(deadline) {
  let shouldYield = false; // 是否中断任务
  while(nextUnitOfWork && !shouldYield) {
    // 当前存在任务且不需要中断, 调度work,并获取下一个任务
    nextUnitOfWork = performUnitOfWork(
      nextUnitOfWork
    )

    // 判断浏览器是否有空闲时间，如果小于1则需要中断，将控制权交给浏览器
    shouldYield = deadline.timeRemaining() < 1
  }
  if(!nextUnitOfWork && wipRoot) {
    // 如果已经没有继续的任务 且当前存在更新的fiber 则进入commit阶段
    // 任务调度完才commit的原因：如果每次执行fiber的work都更新dom,由于存在中断，用户会看到未完成状态的dom，所以一次性commit
    commitRoot()
  }

  // 判断空闲时间
  requestIdleCallback(workLoop)
}

// 浏览器有空闲，则开始调用workLoop
requestIdleCallback(workLoop)

function performUnitOfWork(fiber) {
  // 支持函数组件和host组件（普通）
  const isFunctionComponent = fiber.type instanceof Function;
  // 判断组件类型是否为函数组件，进入不同的更新方法
  if(isFunctionComponent) {
    updateFunctionComponent(fiber)
  } else {
    updateHostComponent(fiber)
  }
  // 返回下一个work, 先深度遍历到子节点，然后兄弟节点，没有的话返回到父节点直到root，执行结束
  if(fiber.child) {
    return fiber.child
  }
  let nextFiber = fiber
  while(nextFiber) {
    if(nextFiber.sibling) {
      return nextFiber.sibling
    }

    nextFiber = nextFiber.parent; // 若无子节点和继续的兄弟节点 则返回到上一层
  }
}

let wipFiber = null;
let hookIndex = null;

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0; // 追踪当前hook的下标
  wipFiber.hooks = [];
  const elements = [fiber.type(fiber.props)]
  reconcileChildren(fiber, elements)
}

function updateHostComponent(fiber) {
  // 判断当前fiber是否有节点
  if(!fiber.dom) {
    fiber.dom = createDom(fiber)
  }

  // 从子节点开始
  const elements = fiber.props.children;
  reconcileChildren(fiber, elements)
}

function useState(initial) {
  const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  }

  // 更新state
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach(action => {
    hook.state = action(hook.state)
  })

  const setState = action => {
    hook.queue.push(action)
    // 创建新的render流程
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    }
    nextUnitOfWork = wipRoot;
    deletions = [];
  }

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState]
}

/**
 * 调和，diff, 打effectTag 创建新的Fiber
 * @param {*} wipFiber 父Fiber
 * @param {*} elements 子节点
 */
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let prevSibling = null; // 前面的兄弟节点
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child; // 上一次提交的父fiber的子节点引用

  while(index < elements.length || oldFiber !== null) {
    const element = elements[index]
    // 创建fiber
    let newFiber = null;
    
    // diff 旧节点和新的节点
    const sameType = oldFiber && element && oldFiber.type === element.type;
    if(sameType) {
      // 更新
      newFiber = {
        type: element.type,
        props: element.props, // 属性改变
        parent: wipFiber,
        alternate: oldFiber,
        dom: oldFiber.dom,  // 更新复用节点
        effectTag: 'UPDATE' // 打上'UPDATE' Tag
      }
    }
    if(element && !sameType) {
      // 新增(无法复用节点)
      newFiber = {
        type: element.type,
        props: element.props,
        parent: wipFiber,
        alternate: null,
        dom: null, 
        effectTag: 'PLACEMENT' // 打上'PLACEMENT' Tag
      }
  
    }
    if(oldFiber && !sameType) {
      // 删除
      // 没有新建fiber, 旧fiber打上"DELETION"，并将引用保存到deletions中
      oldFiber.effectTag = 'DELETION';
      deletions.push(oldFiber)
    }

    if(oldFiber) {
      oldFiber = oldFiber.sibling
    }
    if(index === 0) {
      wipFiber.child = newFiber; // 以第一个子节点（firstChild）为入口，
    } else {
      prevSibling.sibling = newFiber; // 连接前一个兄弟上
    }

    prevSibling = newFiber; // 指针移动到最新的兄弟节点上
  }
}

// 是否为判断的事件属性
const isEvent = key => key.startsWith("on");
// 非children、event以外的常规属性
const isProperty = key => key !== 'children' && !isEvent(key);
// 判断是否为更新的属性
const isNew = (prev, next) => key => prev[key] !== next[key];
// 判断是否是被删除的旧属性
const isGone = (prev, next) => key => !(key in next)
// 节点更新操作
function updateDom(dom, prevProps, nextProps) {
  // 删除旧的事件监听
  Object.keys(prevProps)
  .filter(isEvent)
  .filter(key => !(key in nextProps) || isNew(prevProps,nextProps)[key])
  .forEach(name => {
    const eventType = name.toLowerCase().substring(2);
    dom.removeEventListener(
      eventType,
      prevProps[name]
    )
  })

  // 删除旧的属性
  Object.keys(prevProps)
  .filter(isProperty)
  .filter(isGone(prevProps, nextProps))
  .forEach(name => {
    dom[name] = ''
  });

  // 设置或更新新属性
  Object.keys(nextProps)
  .filter(isProperty)
  .filter(isNew(prevProps, nextProps))
  .forEach(name => {
    dom[name] = nextProps[name]
  })

  // 设置新的事件监听
  Object.keys(nextProps)
  .filter(isEvent)
  .filter(isNew(prevProps, nextProps))
  .forEach(name => {
    const eventType = name.toLowerCase().substring(2);
    dom.addEventListener(
      eventType,
      nextProps[name]
    )
  })
}

// commit阶段，dom渲染
function commitRoot() {
  deletions.forEach(fiber => commitWork(fiber))
  commitWork(wipRoot)
  wipRoot = null; // 提交后 清除根节点引用
}

function commitWork(fiber) {
  if(!fiber) {
    return 
  }
  
  // 对于不存在父节点的Fiber(函数组件类型)，需要一直找到父节点为止
  let domParentFiber = fiber.parent;
  while(!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom; // 父节点，对于根节点就是挂载的容器dom
  // 根据fiber effectTag去执行不同的dom操作
  // 新增 effectTag为PLACEMENT
  if(fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) {
    domParent.appendChild(fiber.dom);
  }
  // 更新 effectTag为UPDATE
  else if(fiber.effectTag === 'UPDATE' && fiber.dom !== null) {
    // 新旧props比较
    updateDom(
      fiber.dom,
      fiber.alternate.props,
      fiber.props,
    )
  }
  // 删除 effectTag为DELETION
  else if(fiber.effectTag === 'DELETION') {
    // domParent.removeChild(fiber.dom)
    // 需要一直找到对应的dom,支持函数组件
    commitDeletion(fiber, domParent)
  }

  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

function commitDeletion(fiber, domParent) {
  if(fiber.dom) {
    domParent.removeChild(fiber.dom)
  } else {
    commitDeletion(fiber.child, domParent)
  }
}

function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternate: currentRoot, // 每一个fiber都有alternate联系着旧fiber的对应引用
  }

  // 下一个任务
  nextUnitOfWork = wipRoot;
}

const FakeReact = {
  createElement,
  render,
  useState,
}

function FuncComponent1() {
  return (
      <div>
          简单函数组件1
      </div>
  )
}

function FuncComponent() {
  return (
      <div>
          简单函数组件
          <FuncComponent1 />
      </div>
  )
}

class ClassComponent {
  render() {
    return (
      <div>
        类组件
      </div>
    )
  }
}


// const element = (
//   <div>
//     普通文本
//     <span style="color: red">普通文本</span>        
//     <FuncComponent />
//     <ClassComponent />
//   </div>
// )
/**@jsx FakeReact.createElement */
function Counter() {
  const [state, setState] = useState();
  return (
    <h1 onClick={() => setState(c => c + 1)}>
      Count: {state}
    </h1>
  )
}
const element = Counter

FakeReact.render(element, document.getElementById('root'))