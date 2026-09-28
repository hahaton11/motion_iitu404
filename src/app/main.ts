import '../board/theme.css'
import './style.css'
import { App } from './app'

/** Точка входа продукта: старт → камера → калибровка → обучение → челлендж → финал. ?input=mouse — мышь. */
const root = document.getElementById('app')
if (!root) throw new Error('#app not found')
new App(root).start()
