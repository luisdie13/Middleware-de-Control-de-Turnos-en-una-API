import express from 'express';
import fs from 'fs';

// Inicialización de la aplicación
const app = express();
const PORT = 3000;

// Configuración de middlewares
app.use(express.json());

// Cargar datos persistentes si existen
let colaTurnos = loadQueueData();

function loadQueueData() {
  try {
    const data = fs.readFileSync('queue.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // Si no existe el archivo, devolver estructura vacía
    return {
      general: [],
      prioritario: [],
      vip: []
    };
  }
}

function saveQueueData() {
  fs.writeFileSync('queue.json', JSON.stringify(colaTurnos));
}

// Middleware para validar turno VIP
const validarVIP = (req, res, next) => {
  const codigoVIP = req.headers['codigo-vip'];
  if (req.body.tipo === 'vip' && codigoVIP !== 'VIP123') {
    return res.status(403).json({ 
      error: 'Acceso denegado. Se requiere código VIP válido en los headers' 
    });
  }
  next();
};

// Middleware para validar turno prioritario
const validarPrioritario = (req, res, next) => {
  if (req.body.tipo === 'prioritario') {
    if (typeof req.body.edad !== 'number' || req.body.edad <= 60) {
      return res.status(400).json({ 
        error: 'Los turnos prioritarios son solo para mayores de 60 años' 
      });
    }
  }
  next();
};

// Validación común para todos los turnos
const validarTurno = (req, res, next) => {
  const { nombre, edad, tipo } = req.body;
  
  if (!nombre || !edad || !tipo) {
    return res.status(400).json({ 
      error: 'Nombre, edad y tipo son campos requeridos' 
    });
  }

  if (typeof nombre !== 'string' || nombre.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Nombre debe ser un texto válido' 
    });
  }

  if (typeof edad !== 'number' || edad <= 0 || edad > 120) {
    return res.status(400).json({ 
      error: 'Edad debe ser un número entre 1 y 120' 
    });
  }

  const tiposPermitidos = ['general', 'prioritario', 'vip'];
  if (!tiposPermitidos.includes(tipo)) {
    return res.status(400).json({ 
      error: `Tipo de turno no válido. Los tipos permitidos son: ${tiposPermitidos.join(', ')}` 
    });
  }

  next();
};

// Registrar nuevo turno
app.post('/turno', validarTurno, validarVIP, validarPrioritario, (req, res) => {
  const { nombre, edad, tipo } = req.body;

  const nuevoTurno = {
    id: Date.now(),
    nombre: nombre.trim(),
    edad,
    tipo,
    fecha: new Date().toISOString(),
    atendido: false
  };

  colaTurnos[tipo].push(nuevoTurno);
  saveQueueData();
  
  res.status(201).json({ 
    mensaje: 'Turno registrado exitosamente',
    turno: nuevoTurno,
    posicion: colaTurnos[tipo].length
  });
});

// Atender siguiente turno
app.get('/atender', (req, res) => {
  let turnoAtendido = null;
  let tipoAtendido = '';

  // Prioridad: VIP > Prioritario > General
  if (colaTurnos.vip.length > 0) {
    turnoAtendido = colaTurnos.vip.shift();
    tipoAtendido = 'vip';
  } else if (colaTurnos.prioritario.length > 0) {
    turnoAtendido = colaTurnos.prioritario.shift();
    tipoAtendido = 'prioritario';
  } else if (colaTurnos.general.length > 0) {
    turnoAtendido = colaTurnos.general.shift();
    tipoAtendido = 'general';
  }

  if (!turnoAtendido) {
    return res.status(200).json({ 
      mensaje: 'No hay turnos en espera' 
    });
  }

  turnoAtendido.atendido = true;
  saveQueueData();

  res.json({
    mensaje: 'Turno atendido',
    tipo: tipoAtendido,
    turno: turnoAtendido,
    enEspera: {
      vip: colaTurnos.vip.length,
      prioritario: colaTurnos.prioritario.length,
      general: colaTurnos.general.length
    }
  });
});

// Obtener estado de la cola
app.get('/cola', (req, res) => {
  res.json({
    total: {
      vip: colaTurnos.vip.length,
      prioritario: colaTurnos.prioritario.length,
      general: colaTurnos.general.length,
      total: colaTurnos.vip.length + colaTurnos.prioritario.length + colaTurnos.general.length
    },
    proximos: {
      vip: colaTurnos.vip.slice(0, 5),
      prioritario: colaTurnos.prioritario.slice(0, 5),
      general: colaTurnos.general.slice(0, 5)
    }
  });
});

// Obtener información de un turno específico
app.get('/turno/:id', (req, res) => {
  const id = Number(req.params.id);
  
  // Buscar en todas las colas
  const todasLasColas = [...colaTurnos.vip, ...colaTurnos.prioritario, ...colaTurnos.general];
  const turno = todasLasColas.find(t => t.id === id);

  if (!turno) {
    return res.status(404).json({ 
      error: 'Turno no encontrado' 
    });
  }

  res.json(turno);
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor' 
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de turnos escuchando en http://localhost:${PORT}`);
  console.log('Endpoints disponibles:');
  console.log(`- POST http://localhost:${PORT}/turno`);
  console.log(`- GET http://localhost:${PORT}/atender`);
  console.log(`- GET http://localhost:${PORT}/cola`);
  console.log(`- GET http://localhost:${PORT}/turno/:id`);
});