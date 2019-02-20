import React, { Component } from 'react'
import {
  BrowserRouter as Router,
  Route,
  Link,
  Switch,
  Redirect
} from 'react-router-dom'
import io from 'socket.io-client'
import './App.css'
import { config } from './config'
import { isPrintable, SocketContext } from './helper'
import ChatWindow from './ChatWindow'
import SceneView from './SceneView'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faCircle,
  faPlayCircle,
  faStopCircle
} from '@fortawesome/free-regular-svg-icons'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
library.add(faCircle, faTimes, faPlayCircle, faStopCircle)

function newSocket () {
  return io(config.server_uri)
}

class UserList extends Component {
  constructor (props) {
    super(props)

    this.state = {
      users: []
    }

    this.props.socket.on('users', users => {
      this.setState({ users })
    })
  }

  render () {
    const myUser = this.state.users.find(user => user.uid === this.props.myUid)
    return (
      <div className='UserList'>
        {myUser && <UserListEntry user={myUser} className='UserListEntryMe' />}
        {this.state.users.map(user => {
          if (user.uid === this.props.myUid) return null
          return <UserListEntry user={user} />
        })}
      </div>
    )
  }
}

function UserListEntry (props) {
  const user = props.user
  const online = user.online ? 'UserListEntryOnline' : 'UserListEntryOffline'
  const master = user.master ? 'UserListEntryMaster' : ''
  return (
    <div className={`UserListEntry ${online} ${master} ${props.className}`}>
      <span className='UserListEntryName'>{user.name}</span>
      {user.master || (
        <span className='UserListEntryMaru'>
          {user.maru}
          <FontAwesomeIcon icon={['far', 'circle']} />
        </span>
      )}
      {user.master || (
        <span className='UserListEntryPeke'>
          {user.peke}
          <FontAwesomeIcon icon='times' />
        </span>
      )}
    </div>
  )
}

class QuizRoom extends Component {
  constructor (props) {
    super(props)
    this.state = {
      socket: newSocket(),
      shouldWaitForReset: false,
      didAuth: false,
      established: null, // connecting
      round: null
    }
    this.roomid = props.roomid

    this.master = props.master
    this.uid = props.uid
    this.password = props.password

    this.socket = this.state.socket
    this.socket.on('disconnect', () => {
      this.setState({ established: null })
    })
    this.socket.on('auth', (x, done) => {
      done(this.uid, this.password, this.roomid)
    })
    this.socket.on('auth-result', ({ status, shouldWaitForReset }) => {
      this.setState({
        established: status === 'ok',
        shouldWaitForReset,
        didAuth: true
      })
    })
    this.socket.on('quiz-info', ({ round }) => {
      this.setState({ round })
    })
  }

  render () {
    if (this.state.established === false) {
      return <Route component={RoomNotFound} />
    }

    return (
      <SocketContext.Provider
        value={{
          established: this.state.established
        }}
      >
        <div className='QuizRoom'>
          <SceneView
            master={this.master}
            socket={this.socket}
            roomid={this.roomid}
            didAuth={this.state.didAuth}
            waitForReset={this.state.shouldWaitForReset}
            onProcessForAuth={this.handleProcessForAuth}
          />
          <div>
            <ConnectionStatus />
            <QuizStatus round={this.state.round} />
            <UserList socket={this.socket} myUid={this.uid} />
            <ChatWindow socket={this.socket} />
          </div>
        </div>
      </SocketContext.Provider>
    )
  }

  handleProcessForAuth = () => {
    this.setState({ didAuth: false, shouldWaitForReset: false })
  }
}

class ConnectionStatus extends Component {
  static contextType = SocketContext
  render () {
    return (
      <div className='ConnectionStatus'>
        {this.context.established === null && (
          <p>サーバへの接続が不安定です。しばらくお待ちください……</p>
        )}
      </div>
    )
  }
}

function QuizStatus (props) {
  return (
    <div className='QuizStatus'>
      <p>Round {props.round}</p>
    </div>
  )
}

const App = () => (
  <Router>
    <div className='App'>
      <h1>Mio - Intro Quiz App</h1>
      <Switch>
        <Route exact path='/' component={Home} />
        <Route exact path='/create-room' component={CreateRoom} />
        <Route path='/room/:roomid' component={Room} />
        <Route component={NoMatch} />
      </Switch>
    </div>
  </Router>
)

const Home = () => (
  <div>
    <p>（◕‿‿◕）下のリンクから部屋を作って、出題者になってよ</p>
    <Link to='/create-room'>あそぶ部屋を作る</Link>
  </div>
)

const NoMatch = ({ location }) => (
  <div>
    <h1>404 Not Found</h1>
    <p>
      <code>{location.pathname}</code> not found
    </p>
  </div>
)

const RoomNotFound = ({ location }) => (
  <div>
    <h2>お探しの部屋は見つかりませんでした</h2>
    <p>
      この部屋は削除されたか、もともと存在しませんでした。
      中に居る人が全員居なくなると部屋は自動的に削除されます。ゆるして
    </p>
    <p>
      <Link to='/create-room'>
        ここから部屋を作って新しいゲームを始めて下しあ。
      </Link>
    </p>
  </div>
)

const Room = ({ match, location }) =>
  location.state ? (
    <QuizRoom roomid={match.params.roomid} {...location.state} />
  ) : (
    <IssueAccount roomid={match.params.roomid} />
  )

class IssueAccount extends Component {
  constructor (props) {
    super(props)

    this.STAGE = { WAITING_INPUT: 0, CONNECTING: 1, REDIRECT: 2, ERROR: 3 }
    this.state = { state: null, stage: null }
    this.inputName = React.createRef()
    this.socket = newSocket()

    this.socket.emit('room-exists', { roomid: this.props.roomid }, exists => {
      this.setState({
        stage: exists ? this.STAGE.WAITING_INPUT : this.STAGE.ERROR
      })
    })
  }

  handleSubmit = e => {
    e.preventDefault()

    if (!isPrintable(this.inputName.current.value)) return

    this.socket.emit(
      'issue-uid',
      { name: this.inputName.current.value, roomid: this.props.roomid },
      (uid, password) => {
        if (uid === null || password === null)
          this.setState({ stage: this.STAGE.ERROR })
        else
          this.setState({
            stage: this.STAGE.REDIRECT,
            state: { uid, password, master: false }
          })
        this.socket.close()
        delete this.socket
      }
    )
    this.setState({ stage: this.STAGE.CONNECTING })
  }

  render () {
    switch (this.state.stage) {
      case this.STAGE.WAITING_INPUT:
        return (
          <div className='IssueAccount'>
            <h2>イントロクイズに招待されています</h2>
            <form onSubmit={this.handleSubmit}>
              <label>
                あなたの名前：
                <input type='text' ref={this.inputName} />
              </label>
              <button type='submit'>参加</button>
            </form>
          </div>
        )

      case this.STAGE.CONNECTING:
        return (
          <div className='IssueAccount'>
            <p>Connecting to the server...</p>
          </div>
        )

      case this.STAGE.REDIRECT:
        return (
          <Redirect
            to={{
              pathname: `/room/${this.props.roomid}`,
              state: this.state.state
            }}
          />
        )

      case this.STAGE.ERROR:
        return <Route component={RoomNotFound} />

      default:
        return <div />
    }
  }
}

class CreateRoom extends Component {
  constructor (props) {
    super(props)

    this.state = {
      redirect: false,
      sending: false
    }

    this.inputName = React.createRef()
    this.socket = newSocket()
  }

  onSubmit = e => {
    e.preventDefault()

    if (!isPrintable(this.inputName.current.value)) return

    this.setState({ sending: true })

    this.socket.emit(
      'create-room',
      { masterName: this.inputName.current.value },
      (uid, password, roomid) => {
        this.uid = uid
        this.password = password
        this.roomid = roomid
        this.setState({ redirect: true })
        this.socket.close()
        delete this.socket
      }
    )
  }

  render () {
    if (this.state.redirect)
      return (
        <Redirect
          to={{
            pathname: '/room/' + this.roomid,
            state: { uid: this.uid, password: this.password, master: true }
          }}
        />
      )

    return (
      <div className='CreateRoom'>
        <h2>あたらしい部屋を作成する</h2>
        <form onSubmit={this.onSubmit}>
          <label>
            あなたの名前：
            <input type='text' ref={this.inputName} />
          </label>
          <button type='submit' disabled={this.state.sending}>
            Submit
          </button>
        </form>
      </div>
    )
  }
}

export default App
