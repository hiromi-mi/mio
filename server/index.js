const server = require('http').createServer()
const io = require('socket.io')(server, {
  serveClient: false
})
const port = process.env.PORT || 4000
server.listen(port)
const uuid = require('uuid/v4')

console.log('start listening at port ' + port)

db = {
  room: {},
  user: {},
  socket: {}
}

const roomid = 'default room'
db.room[roomid] = {
  stage: 0,
  master: null
}

io.on('connection', socket => {
  const log = msg => {
    console.log('[' + socket.id + '] ' + msg)
  }

  const uid = uuid()
  const room = db.room[roomid]
  db.user[uid] = { sid: socket.id }
  db.socket[socket.id] = { uid: uid }

  log('Join in ' + roomid)

  socket.join(roomid)

  socket.on('chat-msg', msg => {
    log('chat-msg: ' + msg)
    io.to(roomid).emit('chat-msg', { id: uuid(), body: msg })
  })

  socket.on('quiz-music', msg => {
    //if (room.stage != 0) {
    //  log('invalid stage')
    //  return
    //}

    log('quiz-music: ' + msg.buf.length)

    room.stage = 1
    room.master = uid

    socket.broadcast.to(roomid).emit('quiz-music', msg)
  })

  socket.on('quiz-answer', msg => {
    log('quiz-answer: ' + msg.answer)

    io.to(db.user[room.master].sid).emit('quiz-answer', {
      uid: uid,
      answer: msg.answer
    })
  })

  socket.on('quiz-result', msg => {
    log('quiz-result: ' + msg)

    socket.broadcast.to(roomid).emit('quiz-result', msg)
  })

  socket.on('disconnect', () => {
    log('Leave')
  })
})
