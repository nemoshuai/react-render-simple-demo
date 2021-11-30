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

const isClass = (target) => target.toString().indexOf('class') !== -1;

function render(element, container) {
  let dom = null;
  switch(element.type) {
    case 'TEXT_ELEMENT':
      dom = document.createTextNode('');
      break;
    case 'FUNCTION_COMPONENT':
      dom = container;
      break;
    case 'CLASS_COMPONENT':
      dom = container;
      break;
    default:
      dom = document.createElement(element.type);
      break;
  }
  
  Object.keys(element.props).filter((key) => key !== 'children').map((key) => dom[key] = element.props[key])
  element.props.children.forEach(child => {
    render(child, dom);
  })

  if(element.type !== 'FUNCTION_COMPONENT' && element.type !== 'CLASS_COMPONENT') {
    container.append(dom)
  }
}

const FakeReact = {
  createElement,
  render
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

/**@jsx FakeReact.createElement */
const element = (
  <div>
    普通文本
    <span style="color: red">普通文本</span>        
    <FuncComponent />
    <ClassComponent />
  </div>
)

FakeReact.render(element, document.getElementById('root'))