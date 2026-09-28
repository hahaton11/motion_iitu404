# S2. Ядро доски

**Зона:** `src/board/**`, `board.html`.
**Зависит от:** контракт `src/contracts/input.ts`, `src/shared/*`.
**Результат:** `export function createBoard(root: HTMLElement, input: InputSource): Board` из `src/board/index.ts`.
Разработка и проверка целиком на `MouseInput`.

## Цель

Доска, которая физически откликается на руку: элементы поднимаются, висят, падают, улетают.
Ощущение важнее количества функций.

## Модель данных

```ts
type ElementKind = 'sticky' | 'rect' | 'square' | 'circle' | 'triangle' | 'image'
interface BoardElement {
  readonly id: string
  readonly kind: ElementKind
  readonly x: number; readonly y: number        // мировые координаты, центр
  readonly w: number; readonly h: number
  readonly rotation: number
  readonly color: string
  readonly text?: string
  readonly src?: string                        // для image, dataURL или blob URL
  readonly z: number
}
interface BoardState {
  readonly elements: readonly BoardElement[]
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number }
  readonly held?: { readonly hand: HandId; readonly id: string; readonly dx: number; readonly dy: number }
  readonly selectedId?: string
}
```

Стор: чистые редьюсеры `(state, action) => state`, история для undo на 50 шагов.

## Модули

| Файл | Ответственность | Чистый |
|---|---|---|
| `model.ts` | типы, фабрики элементов с цветами по умолчанию | да |
| `store.ts` | редьюсеры: add, move, remove, select, bringToFront, pan, zoom, undo | да |
| `geometry.ts` | экран ↔ мир, hit-test для всех фигур с учётом поворота, z-порядок | да |
| `controller.ts` | события InputSource → actions: grab по элементу берёт его, grab по пустому месту панорамирует, throw удаляет | да, если принимает события и возвращает actions |
| `render.ts` | DOM-рендер элементов, диффинг по id, transform через translate3d | нет |
| `cursor.ts` | прицел и тень удерживаемого элемента | нет |
| `fx.ts` | анимации: подъём, падение с отскоком, улёт при броске, появление | нет |
| `theme.css` | токены цвета, типографика, тени, свечение | — |
| `api.ts` | публичный `Board`: addElement, removeElement, getState, subscribe, emitHint | — |

## Поведение

**Прицел.** Полупрозрачная точка 14 px, цвет акцента, `scale(1 - closure * 0.4)`.
Над элементом, который можно взять, точка подсвечивает его контур.

**Захват.** `grab` над элементом: элемент поднимается на передний план, `scale 1.06`,
тень растёт и смещается вниз, наклон до 4° по горизонтальной скорости курсора.
Прицел скрывается, вместо него сам элемент следует за рукой с лёгким инерционным отставанием.

**Отпускание.** `release`: анимация падения 220 мс, тень сжимается, отскок scale 0.97 → 1.
**Бросок.** `throw`: элемент летит по вектору скорости за край экрана с вращением и затуханием, удаляется из стора. Undo возвращает.
**Панорама.** `grab` по пустому месту двигает камеру вместе с рукой.
**Zoom.** `zoom` масштабирует вокруг `cx, cy`, пределы 0.25–4.
**Point.** Выделение элемента, контур и небольшая плашка с действиями: дублировать, цвет, удалить.
Действия выбираются следующим point по кнопке плашки.

**Фигуры.** Стикер с текстом, прямоугольник, квадрат, круг, треугольник, картинка. На демо-странице
панель добавления, до кармана из S3 она заменяет источник элементов.

**Контекстные подсказки.** `board.emitHint(evt)` отдаёт наружу подсказки доски, например
«Отпусти элемент над доской, а не за её краем». Отображение подсказок в S4.

## Визуальный стиль

Тёмный фон с едва заметной сеткой точек, которая двигается с камерой. Элементы с мягкими
тенями и тонким свечением контура. Акцентный цвет холодный голубой. Один шрифт интерфейса.
Анимации через transform и opacity, без layout-thrash.

## Приёмка

- [ ] мышью через `MouseInput`: взять, перенести, отпустить с анимацией падения
- [ ] бросок удаляет элемент с анимацией, undo возвращает
- [ ] панорама по пустому месту и zoom колесом
- [ ] point выделяет элемент, работает дублирование
- [ ] все 6 типов элементов отображаются и берутся с корректным hit-test
- [ ] 60 FPS при 50 элементах в Chrome
- [ ] тесты на store, geometry, controller
