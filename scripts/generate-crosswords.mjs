// Generates src/lib/crossword/wordbank.ts and src/lib/crossword/puzzles.ts.
//
// Each language below is the single source of truth for answers and clues; the
// generator places words on grids with a greedy, crossing-first strategy and
// writes a self-consistent puzzle file. Run with `npm run gen:crosswords`.
//
// The Russian bank, seed and algorithm are unchanged, so the shipped Russian
// grids stay byte-identical across regenerations.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RU_BANK_TEXT = `
АТОМ|Мельчайшая частица вещества
МОЛЕКУЛА|Соединение нескольких атомов
ЭЛЕКТРОН|Отрицательная частица в атоме
ПРОТОН|Положительная частица ядра
НЕЙТРОН|Нейтральная частица ядра
КВАРК|Составная часть протона
ФОТОН|Частица света
ЛАЗЕР|Узкий пучок света
РАДАР|Прибор, замечающий объекты по радиоволнам
ТЕЛЕСКОП|Прибор для наблюдения звёзд
МИКРОСКОП|Прибор для изучения мелкого
БАРОМЕТР|Измеряет атмосферное давление
ТЕРМОМЕТР|Измеряет температуру
ГЕНЕРАТОР|Превращает движение в электричество
ТУРБИНА|Колесо, вращаемое паром или водой
РЕАКТОР|Сердце атомной станции
АККУМУЛЯТОР|Накапливает и отдаёт заряд
АНТЕННА|Ловит радиоволны
ПРОЦЕССОР|Мозг компьютера
АЛГОРИТМ|Последовательность шагов решения
ПРОГРАММА|Набор команд для машины
ИНТЕРФЕЙС|Способ связи человека с программой
ПИКСЕЛЬ|Мельчайшая точка изображения
МОНИТОР|Экран компьютера
ПРИНТЕР|Печатает документы
СКАНЕР|Переводит бумагу в цифру
МОДЕМ|Соединяет с интернетом
ПАРОЛЬ|Секретное слово для входа
СЕРВЕР|Машина, отдающая сайты
БРАУЗЕР|Программа для интернета
ИМПЕРИЯ|Государство во главе с монархом
МОНАРХИЯ|Власть одного правителя
РЕСПУБЛИКА|Страна без монарха
ДЕМОКРАТИЯ|Власть народа
ПАРЛАМЕНТ|Законодательное собрание
ДИПЛОМАТ|Представитель страны за рубежом
РЕВОЛЮЦИЯ|Резкая смена власти
РЕФОРМА|Планомерное изменение
ДИНАСТИЯ|Ряд правителей одной семьи
ИМПЕРАТОР|Правитель империи
ФАРАОН|Царь Древнего Египта
ГЛАДИАТОР|Боец на арене Рима
АКРОПОЛЬ|Верхний город в Афинах
ПИРАМИДА|Усыпальница фараона
СФИНКС|Статуя с телом льва
ОБЕЛИСК|Высокий гранёный столб
МАНУСКРИПТ|Старинная рукопись
ПЕРГАМЕНТ|Материал для древних книг
СВИТОК|Скрученная рукопись
ЛЕТОПИСЬ|Запись событий по годам
АРТЕФАКТ|Предмет из прошлого
ЭКСПОНАТ|Предмет в музее
КОЛЛЕКЦИЯ|Собрание предметов
ПАЛИТРА|Дощечка для смешивания красок
МОЛЬБЕРТ|Подставка для холста
ЭТЮД|Небольшой набросок
НАТЮРМОРТ|Картина с предметами
ПЕЙЗАЖ|Картина природы
ПОРТРЕТ|Изображение человека
ФРЕСКА|Роспись по сырой штукатурке
МОЗАИКА|Картина из кусочков
ВИТРАЖ|Цветное стекло в окне
ГРАВЮРА|Оттиск с доски
ЭСКИЗ|Предварительный рисунок
КОЛОРИТ|Сочетание красок
ПЕРСПЕКТИВА|Изображение глубины на холсте
КОМПОЗИЦИЯ|Построение картины
ОРНАМЕНТ|Узор из повторяющихся фигур
БАРЕЛЬЕФ|Выпуклое изображение на стене
АРКА|Дугообразный проём
КУПОЛ|Круглая крыша
ФАСАД|Лицевая сторона здания
ПОРТАЛ|Парадный вход
КОЛОННА|Опора в виде столба
ВУЛКАН|Гора, извергающая лаву
ГЕЙЗЕР|Горячий фонтан из земли
ЛЕДНИК|Застывшая масса льда
АЙСБЕРГ|Плавучая ледяная гора
АТОЛЛ|Коралловый остров-кольцо
ЛАГУНА|Мелкий залив у моря
ПРОЛИВ|Узкая вода между берегами
ПОЛУОСТРОВ|Земля, омытая с трёх сторон
ПЛАТО|Ровная возвышенность
КАНЬОН|Глубокое ущелье
ПРЕРИЯ|Травянистая равнина Америки
САВАННА|Тропическая степь
ТУНДРА|Холодная безлесная равнина
ТАЙГА|Хвойный лес Сибири
БОЛОТО|Топкое место
ДЖУНГЛИ|Густой тропический лес
ОАЗИС|Зелёный остров в пустыне
МИРАЖ|Обманчивое видение в пустыне
ДЮНА|Песчаный холм
СТАЛАКТИТ|Сосулька в пещере сверху
СТАЛАГМИТ|Столбик в пещере снизу
ГРАНИТ|Твёрдый камень для памятников
БАЗАЛЬТ|Тёмная вулканическая порода
МРАМОР|Камень для скульптур
МАЛАХИТ|Зелёный поделочный камень
ЯНТАРЬ|Окаменевшая смола
ЖЕМЧУГ|Драгоценная бусина из раковины
КОРАЛЛ|Скелет морского полипа
ПЕРЛАМУТР|Радужный слой раковины
ВЫДРА|Речной хищник семейства куньих
БАРСУК|Ночной зверь с полосатой мордой
ГОРНОСТАЙ|Пушной зверёк, зимой белый
СОБОЛЬ|Ценный пушной зверёк Сибири
НОРКА|Пушной зверёк, живёт у воды
СУРОК|Спит всю зиму в норе
БОБР|Строит плотины на реке
ОНДАТРА|Грызун, похожий на бобра
ДИКОБРАЗ|Зверь в иглах
ЛЕНИВЕЦ|Самый медленный зверь
БРОНЕНОСЕЦ|Зверь в костяной броне
ТАПИР|Родственник лошади с хоботком
ОКАПИ|Животное с полосатыми ногами
АЛЬПАКА|Южноамериканский родич ламы
ГАЗЕЛЬ|Быстрая стройная антилопа
АНТИЛОПА|Рогатая жительница саванны
ГЕПАРД|Самый быстрый зверь
ЛЕОПАРД|Пятнистый хищник, отдыхает на дереве
ЯГУАР|Пятнистый хищник Америки
ПУМА|Хищник, он же кугуар
РЫСЬ|Кошка с кисточками на ушах
ГИЕНА|Падальщик с жутким хохотом
ШАКАЛ|Мелкий родич волка
ПЕСЕЦ|Белый полярный лис
ФЛАМИНГО|Розовая птица на одной ноге
ПЕЛИКАН|Птица с мешком под клювом
ЖУРАВЛЬ|Длинноногая птица с курлыканьем
БАКЛАН|Птица, ныряющая за рыбой
АЛЬБАТРОС|Морская птица с большим размахом
КОЛИБРИ|Самая маленькая птичка
ИВОЛГА|Жёлто-чёрная певчая птица
ТЕТЕРЕВ|Лесная птица, токует весной
ГЛУХАРЬ|Крупная птица, поёт на току
ПАПОРОТНИК|Растение с резными листьями без цветов
ОРХИДЕЯ|Экзотический цветок причудливой формы
КАКТУС|Колючее растение пустыни
БАОБАБ|Толстое дерево Африки
СЕКВОЙЯ|Самое высокое дерево
ЭВКАЛИПТ|Дерево, чьи листья любят коалы
ПЛАТАН|Дерево с пятнистой корой
ЯСЕНЬ|Дерево с перистыми листьями
ТОПОЛЬ|Дерево, дающее летний пух
ОСИНА|Дерево с дрожащими листьями
ОЛЬХА|Дерево у реки с серёжками
ЛИСТВЕННИЦА|Хвойное дерево, сбрасывающее иглы
ПИХТА|Хвойное дерево с мягкими иглами
КЕДР|Хвойное дерево с орешками
МАГНОЛИЯ|Дерево с крупными цветами
ЖАСМИН|Душистый куст с белыми цветами
СИРЕНЬ|Куст с лиловыми гроздьями
БОЯРЫШНИК|Колючий куст с красными ягодами
КАЛИНА|Куст с красными горькими ягодами
РЯБИНА|Дерево с оранжевыми гроздьями
ОБЛЕПИХА|Колючий куст с оранжевыми ягодами
СПАРЖА|Зелёный овощ с побегами
АРТИШОК|Овощ, похожий на шишку
БРОККОЛИ|Зелёная капуста с соцветиями
СЕЛЬДЕРЕЙ|Ароматный стебель для супа
ПАТИССОН|Плоская родня кабачка
БАКЛАЖАН|Фиолетовый овощ
КАБАЧОК|Продолговатый летний овощ
РЕДИС|Розовый острый корнеплод
БРЮКВА|Корнеплод, корм для скота
ТОПИНАМБУР|Земляная груша
ГОРЧИЦА|Острая приправа из семян
ИМБИРЬ|Жгучий корень для чая
ШАФРАН|Самая дорогая пряность
БАЗИЛИК|Ароматная зелень к пасте
РОЗМАРИН|Пряная веточка к мясу
КАРДАМОН|Пряность для кофе по-восточному
ВАНИЛЬ|Сладкая пряность из орхидеи
МУСКАТ|Пряный орех для выпечки
КОНТРАБАС|Самый большой смычковый инструмент
ВИОЛОНЧЕЛЬ|Струнный инструмент держат между колен
ГОБОЙ|Деревянный духовой с двойным язычком
ФАГОТ|Низкий деревянный духовой
КЛАРНЕТ|Духовой инструмент с клапанами
ТРОМБОН|Медный духовой с кулисой
ЛИТАВРЫ|Ударные котлы оркестра
ТАМБУРИН|Бубен с бубенчиками
КСИЛОФОН|Ударный из деревянных пластин
ЧЕЛЕСТА|Клавишный инструмент с нежным звоном
АРФА|Струнный инструмент ангелов
ЛЮТНЯ|Старинный струнный инструмент
МАНДОЛИН|Струнный инструмент с овальным корпусом
БАЛАЛАЙКА|Русский треугольный струнный
ДОМРА|Русский струнный с овальным корпусом
ГУСЛИ|Древнерусский струнный инструмент
ВОЛЫНКА|Шотландский духовой с мешком
ОРГАН|Самый большой клавишный инструмент
АДМИРАЛ|Высший морской чин
БОЦМАН|Старший над матросами
ШТУРМАН|Прокладывает курс корабля
ГАРПУН|Копьё для охоты на китов
ЯКОРЬ|Держит судно на месте
ШТУРВАЛ|Руль корабля
КАЮТА|Комната на судне
КУБРИК|Общая комната команды
ТРЮМ|Нижнее помещение судна
ПАЛУБА|Настил на корабле
МАЧТА|Вертикальная опора с парусами
КИЛЬ|Нижняя балка судна
ИЛЛЮМИНАТОР|Окно на корабле
СЕКСТАНТ|Прибор для определения широты
ФАРВАТЕР|Безопасный путь для судов
ШТИЛЬ|Полное безветрие
БРИЗ|Лёгкий ветер у берега
МУССОН|Сезонный ветер
ТАЙФУН|Тропический циклон
АНАЛОГИЯ|Сходство по признаку
АНТИТЕЗА|Противопоставление
ГИПОТЕЗА|Предположение для проверки
АКСИОМА|Утверждение без доказательства
ТЕОРЕМА|Утверждение с доказательством
ПРОПОРЦИЯ|Равенство двух отношений
ВЕКТОР|Направленный отрезок
МАТРИЦА|Таблица чисел
ИНТЕГРАЛ|Площадь под графиком
ФУНКЦИЯ|Зависимость величины от величины
КАТЕГОРИЯ|Общее понятие
КРИТЕРИЙ|Признак для оценки
ПРИНЦИП|Основное правило
АНАЛИЗ|Разложение целого на части
СИНТЕЗ|Соединение частей в целое
ДЕДУКЦИЯ|Вывод от общего к частному
ИНДУКЦИЯ|Вывод от частного к общему
ПАРАДОКС|Странное, нелогичное утверждение
ИНТУИЦИЯ|Чутьё без рассуждений
ЛОГИКА|Наука о правильном мышлении
ЭТИКА|Учение о морали
ЭСТЕТИКА|Учение о красоте
`;

const EN_BANK_TEXT = `
ATOM|The smallest unit of an element
MOLECULE|Two or more atoms bound together
ELECTRON|A negatively charged particle
PROTON|A positively charged particle
NEUTRON|A particle with no charge
QUARK|A building block of a proton
PHOTON|A particle of light
LASER|A narrow concentrated beam of light
RADAR|Detects objects using radio waves
TELESCOPE|A tool for studying the stars
MICROSCOPE|A tool for seeing the very small
THERMOMETER|It measures temperature
BAROMETER|It measures air pressure
GENERATOR|It turns motion into electricity
TURBINE|A wheel spun by steam or water
REACTOR|The heart of a nuclear plant
BATTERY|It stores and gives out charge
ANTENNA|It catches radio waves
PROCESSOR|The brain of a computer
ALGORITHM|A step-by-step solving recipe
PROGRAM|A set of instructions for a machine
PIXEL|The smallest dot of an image
MONITOR|A computer screen
PRINTER|It puts documents on paper
SCANNER|It turns paper into digital form
MODEM|It connects you to the internet
PASSWORD|A secret word for logging in
SERVER|A machine that serves websites
BROWSER|A program for surfing the web
INTERNET|The worldwide computer network
KEYBOARD|You type on it
ROBOT|A machine that works for you
EMPIRE|A state headed by an emperor
MONARCHY|Rule by a single sovereign
REPUBLIC|A state without a monarch
DEMOCRACY|Rule by the people
PARLIAMENT|The law-making assembly
DIPLOMAT|A country's representative abroad
REVOLUTION|A sudden change of power
REFORM|A planned, gradual change
DYNASTY|A line of rulers from one family
EMPEROR|The ruler of an empire
PHARAOH|A king of ancient Egypt
GLADIATOR|A fighter in Rome's arena
PYRAMID|A pharaoh's tomb
SPHINX|A statue with a lion's body
OBELISK|A tall pointed stone pillar
MANUSCRIPT|An old handwritten book
PARCHMENT|The writing material of the ancients
SCROLL|A rolled-up manuscript
CHRONICLE|A year-by-year record of events
ARTEFACT|An object from the past
EXHIBIT|An item in a museum
COLLECTION|A gathered set of objects
CASTLE|A noble's fortress
KNIGHT|An armored warrior on horseback
VIKING|A seafaring Norse warrior
LEGION|A unit of the Roman army
TREASURE|A hoard of gold and gems
TOMB|A stone burial chamber
PALETTE|A board for mixing paints
EASEL|A stand for a canvas
SKETCH|A quick rough drawing
PORTRAIT|A picture of a person
LANDSCAPE|A picture of nature
FRESCO|Painting on wet plaster
MOSAIC|A picture made of small pieces
ENGRAVING|A print made from a cut plate
ORNAMENT|A pattern of repeated shapes
RELIEF|Sculpture raised from a flat back
ARCH|A curved doorway or line
DOME|A rounded roof
FACADE|The face of a building
PORTAL|A grand entrance
COLUMN|A pillar-shaped support
CANVAS|What a painter works on
GALLERY|Where paintings hang
SCULPTURE|Art carved from stone or bronze
EXHIBITION|A public showing of artworks
PERSPECTIVE|Depth drawn on a flat surface
COMPOSITION|How a picture is put together
POSTER|A large printed notice
STATUE|A carved or cast figure
MASTERPIECE|An artist's greatest work
VOLCANO|A mountain that erupts lava
GEYSER|A hot fountain from the ground
GLACIER|A slow river of ice
ICEBERG|A floating mountain of ice
ATOLL|A ring-shaped coral island
LAGOON|A shallow bay by the sea
STRAIT|A narrow passage of water
CANYON|A deep river gorge
PRAIRIE|America's grassy plain
SAVANNA|A tropical grassland
TUNDRA|A cold treeless plain
TAIGA|Siberia's conifer forest
SWAMP|Soft waterlogged ground
JUNGLE|Dense tropical forest
OASIS|A green island in the desert
MIRAGE|A deceptive desert vision
DUNE|A hill of sand
STALACTITE|It hangs from a cave ceiling
STALAGMITE|It grows up from a cave floor
GRANITE|Hard stone for monuments
BASALT|Dark volcanic rock
MARBLE|Stone for sculptures
MALACHITE|A green ornamental stone
AMBER|Fossilized tree resin
PEARL|A gem grown inside a shell
CORAL|A sea polyp's skeleton
PENINSULA|Land almost surrounded by water
PLATEAU|A flat-topped highland
ISTHMUS|A narrow land bridge
DESERT|A vast dry sandy region
WATERFALL|A river's vertical drop
EQUATOR|The line around Earth's middle
MERIDIAN|A line from pole to pole
HORIZON|Where the sky meets the land
CONTINENT|A vast landmass, like Africa
ARCHIPELAGO|A cluster of islands
SUMMIT|The very top of a mountain
OTTER|A river hunter of the weasel family
BADGER|A night animal with a striped face
ERMINE|A weasel that turns white in winter
SABLE|A valuable Siberian furbearer
MINK|A furbearer that lives by water
MARMOT|It sleeps all winter in a burrow
BEAVER|It builds dams on rivers
PORCUPINE|A rodent wrapped in quills
SLOTH|The slowest mammal
ARMADILLO|A mammal in bony armor
TAPIR|A horse relative with a small trunk
OKAPI|An animal with striped legs
ALPACA|A South American cousin of the llama
GAZELLE|A fast graceful antelope
ANTELOPE|A horned dweller of the savanna
CHEETAH|The fastest land animal
LEOPARD|A spotted cat that rests in trees
JAGUAR|America's spotted big cat
PUMA|A big cat also called a cougar
LYNX|A wild cat with tufted ears
HYENA|A scavenger with a wild laugh
JACKAL|A small cousin of the wolf
FLAMINGO|A pink bird on one leg
PELICAN|A bird with a pouch under its beak
CRANE|A long-legged bird with a bugling call
CORMORANT|A bird that dives for fish
ALBATROSS|A seabird with a huge wingspan
HUMMINGBIRD|The smallest bird
ORIOLE|A yellow-and-black songbird
FALCON|A swift bird of prey
PENGUIN|A tuxedoed bird that cannot fly
DOLPHIN|A clever marine mammal
NARWHAL|A whale with a spiral tusk
MANATEE|A gentle sea cow
WALRUS|A tusked Arctic swimmer
PLATYPUS|An egg-laying mammal with a bill
CHAMELEON|A lizard that changes color
IGUANA|A large tropical lizard
GECKO|A lizard that climbs walls
ANACONDA|The heaviest snake
PYTHON|A huge constricting snake
MONGOOSE|It famously fights cobras
MEERKAT|A social mongoose of the desert
ANTEATER|It eats ants with a long tongue
HEDGEHOG|A spiny garden visitor
MOLE|It tunnels underground
SQUIRREL|It buries nuts for the winter
FERN|A plant with lacy leaves and no flowers
ORCHID|An exotic flower of odd shapes
CACTUS|A spiny desert plant
BAOBAB|Africa's fattest tree
SEQUOIA|The tallest tree on Earth
EUCALYPTUS|The tree koalas love
SYCAMORE|A tree with patchy bark
LARCH|A conifer that sheds its needles
CEDAR|A conifer with aromatic wood
MAGNOLIA|A tree with huge blossoms
JASMINE|A fragrant shrub with white flowers
LILAC|A shrub with fragrant clusters
HAWTHORN|A thorny shrub with red berries
ROWAN|A tree with orange berry clusters
BAMBOO|A giant grass that pandas eat
MIMOSA|A sensitive touch-shy plant
CLOVER|A three-leafed meadow plant
NETTLE|A stinging wayside plant
THYME|A fragrant herb for stews
MINT|A cooling fragrant herb
SAGE|A gray-green culinary herb
DANDELION|A fluffy yellow meadow flower
MOSS|A soft green carpet on stones
VINE|A plant that climbs supports
WILLOW|A tree that weeps by the water
BIRCH|A slender tree with white bark
MAPLE|Its leaf is on Canada's flag
POPPY|A red field flower
IRIS|A flower named for a rainbow goddess
PEONY|A lush early-summer blossom
LILY|A flower of the pond
TULIP|A spring bulb flower
ASPARAGUS|A green vegetable with shoots
ARTICHOKE|A vegetable like a flower bud
BROCCOLI|A green cabbage with florets
CELERY|A fragrant stalk for soup
EGGPLANT|A purple vegetable
ZUCCHINI|A long summer squash
RADISH|A sharp pink root
TURNIP|A root crop fed to cattle
GINGER|A hot root for tea
SAFFRON|The priciest spice of all
BASIL|A fragrant herb for pasta
ROSEMARY|A spicy twig for meat
CARDAMOM|A spice for eastern coffee
VANILLA|A sweet spice from an orchid
NUTMEG|A spicy nut for baking
MUSTARD|A hot condiment from seeds
CINNAMON|A spice of rolled bark
TURMERIC|A yellow curry spice
OREGANO|The pizza herb
GARLIC|A pungent bulb
PEPPER|A hot black seasoning
HONEY|Sweet syrup made by bees
CONTRABASS|The largest bowed instrument
CELLO|A bowed instrument held between the knees
OBOE|A wooden wind with a double reed
BASSOON|A low wooden wind instrument
CLARINET|A wind instrument with keys
TROMBONE|A brass wind with a slide
TIMPANI|The orchestra's kettle drums
TAMBOURINE|A drum with jingles
XYLOPHONE|Percussion of wooden bars
CELESTA|A keyboard with a gentle ring
HARP|The string instrument of angels
LUTE|An old plucked instrument
MANDOLIN|A string instrument with an oval body
BALALAIKA|A Russian triangular string instrument
BAGPIPES|Scottish wind with a bag
ORGAN|The largest keyboard instrument
PIANO|Keys, hammers and strings
VIOLIN|The lead bowed instrument
FLUTE|The highest woodwind
TRUMPET|A bright brass voice
SAXOPHONE|A jazz wind of brass
ACCORDION|A bellows-driven keyboard
HARMONICA|A pocket wind instrument
UKULELE|A tiny Hawaiian guitar
BANJO|A twanging folk guitar
DRUM|You beat it with sticks
MELODY|A tune you can hum
RHYTHM|The beat of the music
OCTAVE|Eight notes apart
CHORUS|The part everyone sings
ADMIRAL|The highest naval rank
BOATSWAIN|The chief of the deck crew
NAVIGATOR|It charts the ship's course
HARPOON|A spear for whale hunting
ANCHOR|It holds a ship in place
HELM|The ship's steering wheel
CABIN|A room aboard a ship
GALLEY|A ship's kitchen
BILGE|The lowest part of a hull
DECK|The floor of a ship
MAST|A vertical spar for sails
KEEL|The ship's underwater backbone
PORTHOLE|A window on a ship
SEXTANT|It measures latitude by the stars
FAIRWAY|The safe path for vessels
BREEZE|A light wind by the shore
MONSOON|A seasonal wind
TYPHOON|A tropical cyclone
HARBOR|A shelter for ships
COMPASS|Its needle always finds north
LATITUDE|Distance from the equator
LONGITUDE|Distance from the prime meridian
CAPTAIN|The master of a ship
SAILOR|A crew member at sea
LIFEBOAT|A rescue boat aboard a ship
YACHT|A pleasure sailing boat
RAFT|A flat floating platform
TIDE|The sea's daily rise and fall
STORM|A violent weather event
FOG|A cloud at sea level
ANALOGY|A similarity between relations
ANTITHESIS|A direct opposition
HYPOTHESIS|An assumption put to the test
AXIOM|A statement accepted without proof
THEOREM|A statement with a proof
PROPORTION|The equality of two ratios
VECTOR|A directed segment
MATRIX|A rectangular table of numbers
INTEGRAL|The area under a curve
FUNCTION|One quantity's dependence on another
CATEGORY|A broad class of concepts
CRITERION|A standard for judging
PRINCIPLE|A fundamental rule
ANALYSIS|Breaking a whole into parts
SYNTHESIS|Joining parts into a whole
DEDUCTION|Reasoning from the general to the particular
INDUCTION|Reasoning from the particular to the general
PARADOX|A strange self-contradicting statement
INTUITION|Insight without reasoning
LOGIC|The science of valid reasoning
ETHICS|The study of morals
AESTHETICS|The study of beauty
CONCEPT|An abstract general idea
ABSTRACTION|Distilling the essential
SYLLOGISM|A three-part logical argument
MEMORY|What you remember with
WISDOM|Deep understanding of life
CURIOSITY|A thirst to learn
IMAGINATION|The mind's eye
OAK|A mighty acorn tree
ELM|A tall shade tree
ASH|A tree with winged seeds
IVY|An evergreen climbing vine
OWL|A night bird that hoots
FOX|A cunning red furbearer
BAT|The only flying mammal
GEM|A cut and polished jewel
JADE|A green carved gemstone
OPAL|A gemstone with rainbow play
MOON|Earth's night companion
STAR|A distant burning sun
COMET|An icy visitor with a tail
ORBIT|A path around a star
GLOBE|A model of the Earth
SEA|Vast salt water
LAKE|An enclosed body of water
RIVER|It flows to the sea
STONE|A small piece of rock
SAND|Tiny grains of rock
SNOW|White winter fall
RAIN|Water from the clouds
WIND|Moving air
CLOUD|A floating mass of vapor
SEED|What a plant grows from
ROOT|The hidden part of a plant
LEAF|It is raked in autumn
NEST|A bird's home
WING|What birds fly with
TAIL|It wags on a happy dog
PAW|A cat's soft foot
HIVE|Where bees live
ANT|A tiny hardworking insect
BEE|It makes honey
FISH|It swims and has fins
FROG|It croaks in the pond
DEER|A forest animal with antlers
HARE|It races a tortoise in fables
WOLF|The ancestor of dogs
BEAR|It loves honey and winter dens
`;

const RU_TITLES = [
  "Эрудит", "Логика", "Вершина", "Горизонт", "Орбита", "Кристалл", "Компас", "Меридиан", "Атлас",
  "Хроника", "Рукопись", "Мозаика", "Палитра", "Симфония", "Аккорд", "Мелодия", "Партитура",
  "Резонанс", "Импульс", "Динамика", "Статика", "Оптика", "Квант", "Плазма", "Галактика",
  "Туманность", "Созвездие", "Эклиптика", "Архипелаг", "Континент", "Экватор", "Полюс",
  "Атмосфера", "Стратосфера", "Ионосфера", "Гравитация", "Траектория", "Парабола", "Гипербола",
  "Эллипс", "Синусоида", "Логарифм", "Квадрат", "Гипотенуза", "Катет", "Диагональ", "Радиан",
  "Азимут", "Вертикаль", "Абрис",
];

const RU_SUBTITLES = [
  "Проверьте эрудицию",
  "Слова посложнее",
  "Для начитанных",
  "Классика жанра",
  "Разминка для ума",
  "Тренировка памяти",
  "Тайны и открытия",
  "Наука и природа",
  "Вокруг света",
  "Из глубины веков",
  "Проверка знаний",
  "Умный досуг",
];

const EN_TITLES = [
  "Sage", "Logic", "Summit", "Horizon", "Orbit", "Crystal", "Compass", "Meridian", "Atlas",
  "Chronicle", "Manuscript", "Mosaic", "Palette", "Symphony", "Chord", "Melody", "Score",
  "Resonance", "Impulse", "Dynamics", "Statics", "Optics", "Quantum", "Plasma", "Galaxy",
  "Nebula", "Constellation", "Ecliptic", "Archipelago", "Continent", "Equator", "Pole",
  "Atmosphere", "Stratosphere", "Ionosphere", "Gravity", "Trajectory", "Parabola", "Hyperbola",
  "Ellipse", "Sinusoid", "Logarithm", "Square", "Hypotenuse", "Tangent", "Diagonal", "Radian",
  "Azimuth", "Vertical", "Outline",
];

const EN_SUBTITLES = [
  "Test your knowledge",
  "Trickier words",
  "For well-read players",
  "A classic mix",
  "A mental warm-up",
  "Memory training",
  "Mysteries and discoveries",
  "Science and nature",
  "Around the world",
  "From the depths of time",
  "A knowledge check",
  "Smart leisure",
];

const PUZZLE_COUNT = 50;
const SIZES = [
  [9, 9], [9, 10], [10, 10], [10, 11], [11, 11], [11, 12], [12, 12], [12, 13], [13, 13],
];

const LANGS = [
  {
    code: "ru",
    idPrefix: "",
    bankText: RU_BANK_TEXT,
    titles: RU_TITLES,
    subtitles: RU_SUBTITLES,
    letterRe: /^[А-Я]+$/,
    bankComment: "Harder Russian answer pool: answer -> clue.",
  },
  {
    code: "en",
    idPrefix: "en-",
    bankText: EN_BANK_TEXT,
    titles: EN_TITLES,
    subtitles: EN_SUBTITLES,
    letterRe: /^[A-Z]+$/,
    bankComment: "Harder English answer pool: answer -> clue.",
  },
];

function parseBank(bankText) {
  return bankText.trim().split("\n").map((line) => {
    const bar = line.indexOf("|");
    return { answer: line.slice(0, bar).trim(), clue: line.slice(bar + 1).trim() };
  });
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function assertBank(BANK, letterRe, label) {
  const seen = new Set();
  for (const { answer, clue } of BANK) {
    if (!letterRe.test(answer)) throw new Error(`[${label}] bad answer: ${answer}`);
    if (seen.has(answer)) throw new Error(`[${label}] duplicate answer: ${answer}`);
    if (!clue) throw new Error(`[${label}] missing clue: ${answer}`);
    seen.add(answer);
  }
}

function generateLanguage({ code, idPrefix, bankText, titles, subtitles, letterRe, bankComment }) {
  const BANK = parseBank(bankText);
  assertBank(BANK, letterRe, code);

  const BY_LETTER = (() => {
    const map = new Map();
    for (const { answer } of BANK) {
      for (const letter of new Set(answer)) {
        if (!map.has(letter)) map.set(letter, []);
        map.get(letter).push(answer);
      }
    }
    return map;
  })();

  function attempt(rng, rows, cols, target) {
    const W = cols;
    const H = rows;
    const grid = new Map();
    const placed = [];
    const used = new Set();
    const excluded = new Set(shuffle(BANK, rng).slice(0, Math.floor(BANK.length * 0.3)).map((w) => w.answer));

    const key = (r, c) => r * W + c;
    const get = (r, c) => (r < 0 || c < 0 || r >= H || c >= W ? undefined : grid.get(key(r, c)));

    function valid(word, r, c, dir) {
      const dr = dir === "down" ? 1 : 0;
      const dc = dir === "across" ? 1 : 0;
      const n = word.length;
      const er = r + dr * (n - 1);
      const ec = c + dc * (n - 1);
      if (r < 0 || c < 0 || er >= H || ec >= W) return -1;
      if (get(r - dr, c - dc)) return -1;
      if (get(er + dr, ec + dc)) return -1;
      let crossings = 0;
      for (let i = 0; i < n; i += 1) {
        const rr = r + dr * i;
        const cc = c + dc * i;
        const existing = get(rr, cc);
        if (existing) {
          if (existing !== word[i]) return -1;
          crossings += 1;
        } else if (dir === "across") {
          if (get(rr - 1, cc) || get(rr + 1, cc)) return -1;
        } else if (get(rr, cc - 1) || get(rr, cc + 1)) return -1;
      }
      return crossings;
    }

    function place(word, r, c, dir) {
      const dr = dir === "down" ? 1 : 0;
      const dc = dir === "across" ? 1 : 0;
      for (let i = 0; i < word.length; i += 1) grid.set(key(r + dr * i, c + dc * i), word[i]);
      placed.push({ word, r, c, dir });
      used.add(word);
    }

    const maxLen = Math.max(rows, cols);
    const starters = shuffle(
      BANK.map((w) => w.answer).filter((w) => w.length >= 6 && w.length <= maxLen && !excluded.has(w)),
      rng,
    );
    if (starters.length === 0) return [];
    const first = starters[0];
    const sr = Math.floor(H / 2);
    const sc = Math.floor((W - first.length) / 2);
    place(first, sr, sc, "across");

    while (placed.length < target) {
      const options = [];
      const seen = new Set();
      for (const idx of grid.keys()) {
        const r = Math.floor(idx / W);
        const c = idx % W;
        const ch = grid.get(idx);
        for (const word of BY_LETTER.get(ch) ?? []) {
          if (used.has(word) || excluded.has(word) || word.length > maxLen) continue;
          for (let i = 0; i < word.length; i += 1) {
            if (word[i] !== ch) continue;
            for (const dir of ["across", "down"]) {
              const rr = dir === "down" ? r - i : r;
              const cc = dir === "across" ? c - i : c;
              const signature = `${word}@${rr},${cc},${dir}`;
              if (seen.has(signature)) continue;
              seen.add(signature);
              const crossings = valid(word, rr, cc, dir);
              if (crossings > 0) options.push({ word, r: rr, c: cc, dir, crossings, jitter: rng() });
            }
          }
        }
      }
      if (options.length === 0) break;
      options.sort(
        (a, b) => b.crossings - a.crossings || b.word.length - a.word.length || b.jitter - a.jitter,
      );
      const pick = options[Math.floor(rng() * Math.min(4, options.length))];
      place(pick.word, pick.r, pick.c, pick.dir);
    }
    return placed;
  }

  function bounds(placed) {
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;
    for (const p of placed) {
      const dr = p.dir === "down" ? 1 : 0;
      const dc = p.dir === "across" ? 1 : 0;
      for (let i = 0; i < p.word.length; i += 1) {
        minR = Math.min(minR, p.r + dr * i);
        maxR = Math.max(maxR, p.r + dr * i);
        minC = Math.min(minC, p.c + dc * i);
        maxC = Math.max(maxC, p.c + dc * i);
      }
    }
    return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
  }

  function score(placed) {
    const b = bounds(placed);
    return placed.length * 1000 - b.rows * b.cols * 1.5 - Math.abs(b.rows - b.cols) * 12;
  }

  function generatePuzzle(rng, rows, cols, target) {
    let best = null;
    for (let i = 0; i < 30; i += 1) {
      const placed = attempt(rng, rows, cols, target);
      if (placed.length < 8) continue;
      const value = score(placed);
      if (!best || value > best.value) best = { placed, value };
      if (best.placed.length >= target) break;
    }
    return best?.placed ?? null;
  }

  function difficultyFor(words, rows, cols) {
    const span = Math.max(rows, cols);
    if (words >= 13 || span >= 13) return "hard";
    return "medium";
  }

  const rng = mulberry32(0x5eed1234);
  const puzzles = [];
  let guard = 0;
  while (puzzles.length < PUZZLE_COUNT && guard < PUZZLE_COUNT * 400) {
    guard += 1;
    const [rows, cols] = SIZES[Math.floor(rng() * SIZES.length)];
    const target = Math.min(14, Math.max(8, Math.round((rows + cols) / 2)));
    const placed = generatePuzzle(rng, rows, cols, target);
    if (!placed) continue;
    const b = bounds(placed);
    const entries = placed.map((p) => ({
      answer: p.word,
      row: p.r - b.minR,
      col: p.c - b.minC,
      dir: p.dir,
    }));
    puzzles.push({
      id: "",
      title: "",
      subtitle: "",
      difficulty: difficultyFor(placed.length, b.rows, b.cols),
      rows: b.rows,
      cols: b.cols,
      entries,
    });
  }
  puzzles.sort((a, b) => a.rows * a.cols - b.rows * b.cols);
  puzzles.forEach((puzzle, index) => {
    puzzle.id = `${idPrefix}cw-${String(index + 1).padStart(2, "0")}`;
    puzzle.title = titles[index % titles.length];
    puzzle.subtitle = subtitles[index % subtitles.length];
  });

  const words = puzzles.map((p) => p.entries.length);
  const reused = new Set(puzzles.flatMap((p) => p.entries.map((e) => e.answer)));
  process.stdout.write(
    [
      `[${code}] bank: ${BANK.length} words`,
      `[${code}] puzzles: ${puzzles.length}`,
      `[${code}] words/puzzle: ${Math.min(...words)}-${Math.max(...words)} (avg ${(words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)})`,
      `[${code}] unique answers used: ${reused.size}`,
      "",
    ].join("\n"),
  );

  return { code, BANK, puzzles, bankComment };
}

function tsString(value) {
  return JSON.stringify(value);
}

function renderWordbank(generated) {
  const lines = [
    "// GENERATED by scripts/generate-crosswords.mjs. Do not edit by hand.",
    "// Harder answer pools per language: answer -> clue.",
    "/** Languages the crossword ships content for. */",
    'export type WordBankLang = "en" | "ru";',
    "",
    "export const WORD_BANKS: Record<WordBankLang, Record<string, string>> = {",
  ];
  for (const { code, BANK, bankComment } of generated) {
    lines.push(`  // ${bankComment}`);
    lines.push(`  ${code}: {`);
    for (const { answer, clue } of BANK) lines.push(`    ${tsString(answer)}: ${tsString(clue)},`);
    lines.push("  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

function renderPuzzles(generated) {
  const lines = [
    'import { WORD_BANKS } from "./wordbank";',
    'import type { CrosswordPuzzle, Direction, PuzzleEntry } from "./types";',
    "",
    "// GENERATED by scripts/generate-crosswords.mjs. Do not edit by hand.",
    'type PuzzleLang = "en" | "ru";',
    "",
    "const entry = (lang: PuzzleLang, answer: string, row: number, col: number, dir: Direction): PuzzleEntry => {",
    "  const clue = WORD_BANKS[lang][answer];",
    "  if (!clue) throw new Error(`No clue for ${answer}`);",
    "  return { answer, clue, row, col, dir };",
    "};",
    "",
    "export const CROSSWORD_PUZZLES: Record<PuzzleLang, CrosswordPuzzle[]> = {",
  ];
  for (const { code, puzzles } of generated) {
    lines.push(`  ${code}: [`);
    for (const puzzle of puzzles) {
      lines.push("    {");
      lines.push(`      id: ${tsString(puzzle.id)},`);
      lines.push(`      title: ${tsString(puzzle.title)},`);
      lines.push(`      subtitle: ${tsString(puzzle.subtitle)},`);
      lines.push(`      difficulty: ${tsString(puzzle.difficulty)},`);
      lines.push(`      lang: ${tsString(code)},`);
      lines.push(`      rows: ${puzzle.rows},`);
      lines.push(`      cols: ${puzzle.cols},`);
      lines.push("      entries: [");
      for (const e of puzzle.entries) {
        lines.push(
          `        entry(${tsString(code)}, ${tsString(e.answer)}, ${e.row}, ${e.col}, ${tsString(e.dir)}),`,
        );
      }
      lines.push("      ],");
      lines.push("    },");
    }
    lines.push("  ],");
  }
  lines.push("};", "");
  lines.push("export function puzzlesFor(lang: PuzzleLang): CrosswordPuzzle[] {");
  lines.push("  return CROSSWORD_PUZZLES[lang];");
  lines.push("}", "");
  lines.push("export function getPuzzle(id: string): CrosswordPuzzle | undefined {");
  lines.push('  return (CROSSWORD_PUZZLES.en.find((puzzle) => puzzle.id === id) ?? CROSSWORD_PUZZLES.ru.find((puzzle) => puzzle.id === id));');
  lines.push("}", "");
  return lines.join("\n");
}

function main() {
  const generated = LANGS.map(generateLanguage);

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  mkdirSync(join(root, "src/lib/crossword"), { recursive: true });
  writeFileSync(join(root, "src/lib/crossword/wordbank.ts"), renderWordbank(generated));
  writeFileSync(join(root, "src/lib/crossword/puzzles.ts"), renderPuzzles(generated));
}

main();
