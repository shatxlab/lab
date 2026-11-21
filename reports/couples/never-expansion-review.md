# Never expansion — bilingual editorial review

Reviewed **all 72 originals + 100 additions per language**: 344 cards and every follow-up. English and Russian reviewed independently, not as translations. Only the two additions files and this report edited.

## Findings and resolution

- Replaced the English mistaken-response card (wrong-wave family), repeated food-order envy, repeated compliment-memory beat, failed-eye-flirt variant, and duplicate impress-with-a-skill beat.
- Broadened English stories beyond games/puzzles; replaced elaborate setups with recognizable incidents and a turn. Reduced food concentration in English light/closer.
- Replaced Russian filler note-decoration/internet browsing stories and overlapping reflection, shared-word, quiet-company, and date-admission beats. Kept ordinary affection and playful dating awkwardness.
- Smoothed Russian negative chains and awkward timing; no forced translation alignment. Kept distinct scenarios even where broad themes recur (food, warmth, nerves).
- Follow-ups reviewed for a hypothetical answer when both say never; no names, proof, ranking a partner, or pressure to demonstrate affection. No prohibited content found in additions.

## Offline validation — passed

Python standard-library checks only; no app, browser, network, npm test, typecheck, or build checks run. Checks cover **all 172 cards per language**, with addition-specific ranges and counts.

| Deck | Combined cards | Added light / stories / closer | Added prompt length | Added follow-up length | Unique normalized prompts |
|---|---:|---:|---:|---:|---:|
| EN | 72 + 100 = 172 | 34 / 33 / 33 | 49–116 | 44–92 | 172 / 172 |
| RU | 72 + 100 = 172 | 34 / 33 / 33 | 60–115 | 41–87 | 172 / 172 |

- JSON arrays/allowed fields/string types; category/ID agreement; 100 additions each.
- Exact original addition IDs and order preserved: light 25–58, stories 25–57, closer 25–57.
- All prompts start with the required language prefix; prompt bounds 26–179; follow-up bounds 16–199 and final `?`.
- Combined IDs unique; combined prompts unique after Unicode normalization, case folding, punctuation/spacing removal. Lexical-similarity pair scan additionally inspected; semantic review is editorial, not an automated proof.
- Original-file SHA-256 unchanged across review:
  - `original-en.json`: `669bc0cf5514725fc8b175000763855de4ead250dcbd382bd769d933a8276932`
  - `original-ru.json`: `c2db3cfcf890dbd6f3d830da591e0a36dd5dadfe382b6aec11dd2ca30b74e330`

## Exact field-level edits

EN: 22 cards changed; 78 unchanged. RU: 28 cards changed; 72 unchanged. Below: only modified fields, verbatim before → after; IDs/categories unchanged.

### `additions-en.json`

- **`en-light-31`**
  - `prompt` before: Never have I ever put a biscuit back because it wasn't the biggest one in the packet.
  - `prompt` after: Never have I ever compared two almost identical items in a shop and still been unable to choose.
  - `followUp` before: Which food deserves a very careful first pick?
  - `followUp` after: What tiny difference could sway you between two otherwise identical mugs?
- **`en-light-42`**
  - `prompt` before: Never have I ever turned a cushion over instead of dealing with a small spill.
  - `prompt` after: Never have I ever tried to pull up a sock that had slipped down without taking my shoe off.
  - `followUp` before: What quick tidy-up trick works until someone looks closely?
  - `followUp` after: What small clothing annoyance could use an ingenious fix?
- **`en-light-44`**
  - `prompt` before: Never have I ever answered someone before realizing they were talking to a person on a call.
  - `prompt` after: Never have I ever removed a sock and discovered a small trail of static-clinging laundry attached to it.
  - `followUp` before: What would be a useful signal for 'I'm on a call, not talking to you'?
  - `followUp` after: What part of doing laundry could use a better invention?
- **`en-light-54`**
  - `prompt` before: Never have I ever whispered a password while typing it.
  - `prompt` after: Never have I ever counted a handful of coins twice and got a different total each time.
  - `followUp` before: What little task do you narrate to keep yourself on track?
  - `followUp` after: What small counting task always makes you want to start again?
- **`en-stories-26`**
  - `prompt` before: Never have I ever played a background character in a school show and accidentally stolen the scene.
  - `prompt` after: Never have I ever forgotten a line in a performance and made up a replacement on the spot.
  - `followUp` before: What tiny background role could you have the most fun with?
  - `followUp` after: What could you say to keep a scene going if you forgot your line?
- **`en-stories-28`**
  - `prompt` before: Never have I ever had a kite get stuck in a tree on its very first flight.
  - `prompt` after: Never have I ever gone out for one errand and come home with everything except what I went for.
  - `followUp` before: What simple outdoor toy could still keep you entertained for an afternoon?
  - `followUp` after: What errand would be easiest to get distracted on?
- **`en-stories-32`**
  - `prompt` before: Never have I ever started a craft project with friends and spent more time untangling supplies than making anything.
  - `prompt` after: Never have I ever followed a craft tutorial and ended up with something that wouldn't stand up.
  - `followUp` before: What would count as a successful craft afternoon even if nothing got finished?
  - `followUp` after: What could you add to a wobbly creation to keep it upright?
- **`en-stories-36`**
  - `prompt` before: Never have I ever watched a child solve a puzzle that had defeated all the adults in the room.
  - `prompt` after: Never have I ever recognized a familiar voice on the radio before realizing it belonged to someone I knew.
  - `followUp` before: What childhood game might still give you a challenge?
  - `followUp` after: What sort of radio segment would you enjoy being invited onto?
- **`en-stories-37`**
  - `prompt` before: Never have I ever joined a friendly game in a park and stayed long after the friends I came with had left.
  - `prompt` after: Never have I ever started chatting with a neighbor and ended up getting a tour of their garden.
  - `followUp` before: What game is easy for a new person to join halfway through?
  - `followUp` after: What would you hope to find in a garden you were invited to explore?
- **`en-stories-41`**
  - `prompt` before: Never have I ever taught someone a card trick and then been fooled when they did it back to me.
  - `prompt` after: Never have I ever spent ages explaining a problem before someone pointed out a single unplugged cable.
  - `followUp` before: What would your stage name be for a very low-budget magic act?
  - `followUp` after: What simple check is easiest to overlook when something won't work?
- **`en-stories-43`**
  - `prompt` before: Never have I ever volunteered to keep score and become the busiest person in the game.
  - `prompt` after: Never have I ever taken a photo for strangers and been asked to join them in the next one.
  - `followUp` before: What unnecessary statistic would you enjoy tracking during a game?
  - `followUp` after: What backdrop would make a photo with people you just met worth keeping?
- **`en-stories-49`**
  - `prompt` before: Never have I ever received a parcel so much bigger than its contents that I gathered people to see it.
  - `prompt` after: Never have I ever unpacked a huge parcel and nearly thrown away the tiny item hidden in the packaging.
- **`en-stories-52`**
  - `prompt` before: Never have I ever gone looking for stars with friends and spent most of the evening arguing about constellations.
  - `prompt` after: Never have I ever waited outside with someone to see a shooting star and got excited about a plane instead.
  - `followUp` before: What everyday object could inspire a new constellation?
  - `followUp` after: What would keep you happily occupied while waiting for a glimpse of the night sky?
- **`en-stories-54`**
  - `prompt` before: Never have I ever searched all over the floor for a jigsaw piece that was still in the box.
  - `prompt` after: Never have I ever finished sewing on a button and realized I'd attached it to the wrong side.
  - `followUp` before: What picture would make you want to attempt a jigsaw together?
  - `followUp` after: What small repair would you feel ready to attempt with a tutorial?
- **`en-stories-55`**
  - `prompt` before: Never have I ever tried to record a serious interview with a friend and been interrupted by a loud appliance.
  - `prompt` after: Never have I ever retold an event while someone else there kept adding details I'd forgotten.
  - `followUp` before: What everyday sound would make the least dignified entrance music?
  - `followUp` after: What kind of detail makes a shared story more fun to retell?
- **`en-stories-57`**
  - `prompt` before: Never have I ever helped invent a game to settle a group decision and forgotten what we were deciding.
  - `prompt` after: Never have I ever tried to hang a picture straight and discovered that the nearby shelf was crooked.
  - `followUp` before: What game could we invent using a paper cup and a rolled-up receipt?
  - `followUp` after: What would you line a picture up with if nothing around it looked straight?
- **`en-closer-36`**
  - `prompt` before: Never have I ever deliberately lost a round of a game because someone's victory celebration was so good.
  - `prompt` after: Never have I ever found myself cheering for someone I fancied even though we were on opposite teams.
  - `followUp` before: What would your most over-the-top victory celebration look like?
  - `followUp` after: What playful encouragement would make a friendly rivalry more fun?
- **`en-closer-43`**
  - `prompt` before: Never have I ever tried to maintain flirty eye contact and ended up getting the giggles.
  - `prompt` after: Never have I ever met a date and discovered we'd accidentally worn matching outfits.
  - `followUp` before: What makes a shared look feel playful rather than intense?
  - `followUp` after: What joke could turn accidentally matching outfits into a fun start to a date?
- **`en-closer-44`**
  - `prompt` before: Never have I ever offered to show off a skill to someone I liked and suddenly forgotten how to do it.
  - `prompt` after: Never have I ever been so nervous on a date that I introduced myself twice.
  - `followUp` before: What modest skill could still impress you in the right moment?
  - `followUp` after: What playful reply could make a second introduction feel less awkward?
- **`en-closer-46`**
  - `prompt` before: Never have I ever ordered something on a date and then spent the meal wishing I'd chosen what they had.
  - `prompt` after: Never have I ever agreed to meet for coffee and discovered that neither of us actually liked coffee.
  - `followUp` before: What menu description reliably tempts you away from your original choice?
  - `followUp` after: What would you order instead on a coffee date with no coffee?
- **`en-closer-52`**
  - `prompt` before: Never have I ever told someone about an uncool interest and discovered they loved it too.
  - `prompt` after: Never have I ever bonded with a date over an interest I usually struggled to find anyone to talk about.
  - `followUp` before: What supposedly uncool interest deserves a much better reputation?
  - `followUp` after: What interest would you enjoy finding out a date shared?
- **`en-closer-54`**
  - `prompt` before: Never have I ever received a compliment so specific that I still remembered it years later.
  - `prompt` after: Never have I ever realized halfway through a date that we had both been too polite to pick where to go next.
  - `followUp` before: What small effort do you love having someone notice?
  - `followUp` after: What easy way could we use to choose our next stop without endless 'you decide'?

### `additions-ru.json`

- **`ru-light-35`**
  - `prompt` before: Я никогда не считал(а) ступеньки на лестнице и не сбивал(а) себе счёт собственными мыслями.
  - `prompt` after: Я никогда не считал(а) ступеньки на лестнице, сбиваясь от собственных мыслей.
- **`ru-light-44`**
  - `prompt` before: Я никогда не брал(а) в магазине корзину, а потом нёс(ла) её пустой, зажав покупки под мышкой.
  - `prompt` after: Я никогда не брал(а) в магазине корзину только после того, как покупки переставали помещаться в руках.
- **`ru-stories-26`**
  - `prompt` before: Я никогда не спорил(а) о значении слова, а потом не находил(а) в словаре третий вариант.
  - `prompt` after: Я никогда не спорил(а) о значении слова, обнаружив потом в словаре третий вариант.
- **`ru-stories-29`**
  - `prompt` before: Я никогда не объяснял(а) человеку задачу и не находил(а) решение прямо посреди объяснения.
  - `prompt` after: Я никогда не объяснял(а) человеку задачу, находя решение прямо посреди объяснения.
- **`ru-stories-31`**
  - `prompt` before: Я никогда не учил(а) кого-то своему способу делать простую вещь и не узнавал(а) в ответ способ гораздо легче.
  - `prompt` after: Я никогда не показывал(а) свой способ делать простую вещь человеку, который тут же предлагал способ легче.
- **`ru-stories-33`**
  - `prompt` before: Я никогда не покупал(а) книгу из-за обложки и не обнаруживал(а) внутри совсем не тот жанр.
  - `prompt` after: Я никогда не покупал(а) книгу из-за обложки, ожидая совсем другого жанра.
- **`ru-stories-34`**
  - `prompt` before: Я никогда не начинал(а) рассказ словами «это на минуту», а потом не занимал(а) им весь перерыв.
  - `prompt` after: Я никогда не начинал(а) рассказ словами «это на минуту», занимая в итоге весь перерыв.
- **`ru-stories-35`**
  - `prompt` before: Я никогда не делал(а) красивый заголовок для конспекта дольше, чем писал(а) сам конспект.
  - `prompt` after: Я никогда не садился(-ась) в поезде на своё место, где уже сидел человек с билетом в другой вагон.
  - `followUp` before: Какую скучную тему можно спасти особенно заманчивым заголовком?
  - `followUp` after: Как можно спокойно разобраться, если два человека уверены, что место их?
- **`ru-stories-41`**
  - `prompt` before: Я никогда не искал(а) ответ на один вопрос и не проводил(а) час за чтением совсем о другом.
  - `prompt` after: Я никогда не встречал(а) по пути за забытой вещью человека, с которым давно хотел(а) увидеться.
  - `followUp` before: В какую тему тебе легко провалиться из одной случайной ссылки?
  - `followUp` after: Где тебе было бы особенно приятно случайно встретить старого знакомого?
- **`ru-stories-42`**
  - `prompt` before: Я никогда не разбирал(а) старую сумку и не находил(а) там деньги, о которых давно забыл(а).
  - `prompt` after: Я никогда не находил(а) в старой сумке деньги, о которых давно забыл(а).
- **`ru-stories-48`**
  - `prompt` before: Я никогда не делал(а) поделку по уроку, а потом не придумывал(а) ей другое назначение из-за результата.
  - `prompt` after: Я никогда не придумывал(а) поделке новое назначение, потому что по уроку получилось совсем не то.
- **`ru-stories-49`**
  - `prompt` before: Я никогда не понимал(а) задание в игре совсем иначе и не замечал(а) этого только по смеху остальных.
  - `prompt` after: Я никогда не узнавал(а) по смеху остальных, что понял(а) задание в игре совсем иначе.
- **`ru-stories-53`**
  - `prompt` before: Я никогда не обнаруживал(а) после долгой прогулки, что всё это время рядом с домом было интересное место.
  - `prompt` after: Я никогда не ждал(а) открытия магазина у входа, не заметив, что посетители уже заходят с другой стороны.
  - `followUp` before: Какой маленькой находки тебе не хватает в своём районе?
  - `followUp` after: Какой указатель у входа избавил бы тебя от лишнего ожидания?
- **`ru-stories-57`**
  - `prompt` before: Я никогда не собирал(а) пазл и не находил(а) последнюю деталь только после того, как уже убрал(а) остальные.
  - `prompt` after: Я никогда не находил(а) последнюю деталь пазла только после того, как уже убрал(а) остальные.
- **`ru-closer-25`**
  - `prompt` before: Я никогда не менял(а) одежду перед свиданием несколько раз и не выходил(а) в самом первом варианте.
  - `prompt` after: Я никогда не менял(а) одежду перед свиданием несколько раз, возвращаясь в итоге к первому варианту.
- **`ru-closer-30`**
  - `prompt` before: Я никогда не покупал(а) к встрече любимое угощение человека, а потом не узнавал(а), что перепутал(а) вкус.
  - `prompt` after: Я никогда не приносил(а) на встречу любимое угощение человека, перепутав вкус.
- **`ru-closer-31`**
  - `prompt` before: Я никогда не смотрел(а) на человека вместо экрана и не терял(а) из-за этого нить фильма.
  - `prompt` after: Я никогда не терял(а) нить фильма, засмотревшись на человека рядом.
- **`ru-closer-32`**
  - `prompt` before: Я никогда не носил(а) одолженный шарф и не замечал(а), что он пахнет человеком, который его дал.
  - `prompt` after: Я никогда не замечал(а) знакомый запах на шарфе, который одолжил мне близкий человек.
- **`ru-closer-39`**
  - `prompt` before: Я никогда не знакомил(а) человека, который мне нравится, со своими друзьями и не узнавал(а), что они уже знакомы.
  - `prompt` after: Я никогда не пытался(-ась) познакомить человека, который мне нравится, с друзьями, которые его уже знали.
- **`ru-closer-40`**
  - `prompt` before: Я никогда не называл(а) человека ласково впервые и не произносил(а) это тише всей остальной фразы.
  - `prompt` after: Я никогда не произносил(а) первое ласковое обращение к человеку тише всей остальной фразы.
- **`ru-closer-42`**
  - `prompt` before: Я никогда не готовил(а) вдвоём по разным версиям одного рецепта и не замечал(а) этого только у плиты.
  - `prompt` after: Я никогда не обнаруживал(а) уже у плиты, что мы вдвоём готовим по разным версиям одного рецепта.
- **`ru-closer-43`**
  - `prompt` before: Я никогда не просил(а) человека прийти без особой программы, потому что на придуманное свидание уже не было сил.
  - `prompt` after: Я никогда не придумывал(а) на свидании шуточное название для места, где мы встретились.
  - `followUp` before: Что сделает встречу приятной, если обоим хочется просто посидеть?
  - `followUp` after: Как можно было бы назвать обычную скамейку, если на ней прошло отличное свидание?
- **`ru-closer-45`**
  - `prompt` before: Я никогда не замечал(а), что перенял(а) у близкого человека любимое словечко.
  - `prompt` after: Я никогда не делил(а) с человеком карман куртки, чтобы держаться за руки на холоде.
  - `followUp` before: Какое забавное словечко тебе было бы приятно подхватить?
  - `followUp` after: Что помогло бы сделать прогулку вдвоём уютнее в прохладный день?
- **`ru-closer-47`**
  - `prompt` before: Я никогда не проверял(а) своё отражение в ложке во время свидания, надеясь, что это незаметно.
  - `prompt` after: Я никогда не смеялся(-ась), пытаясь сохранить серьёзное лицо для совместного фото на свидании.
  - `followUp` before: Какая мелочь помогает тебе расслабиться за столиком с новым человеком?
  - `followUp` after: Какую смешную подпись можно придумать к совместному фото, где оба едва сдерживают смех?
- **`ru-closer-48`**
  - `prompt` before: Я никогда не менял(а) мнение о неприметной вещи, узнав, почему она дорога человеку рядом.
  - `prompt` after: Я никогда не слушал(а) на свидании историю самой обычной вещи, которая после этого казалась мне особенной.
- **`ru-closer-51`**
  - `prompt` before: Я никогда не принимал(а) комплимент своей одежде за обычный вопрос и не начинал(а) объяснять, где её купил(а).
  - `prompt` after: Я никогда не узнавал(а) от друзей, что мы с человеком одновременно расспрашивали их друг о друге.
  - `followUp` before: Какую деталь одежды тебе особенно приятно выбирать для встречи?
  - `followUp` after: О какой безобидной мелочи тебе хочется узнать перед первым свиданием?
- **`ru-closer-53`**
  - `prompt` before: Я никогда не признавал(а) на свидании, что хвалёный фильм мне совсем не понравился.
  - `prompt` after: Я никогда не забывал(а) раскрыть зонт на свидании, потому что увлёкся(-лась) разговором.
  - `followUp` before: Какой фильм тебе интересно обсудить с человеком, которому он понравился совсем не так, как тебе?
  - `followUp` after: Куда можно ненадолго спрятаться от дождя и продолжить приятный разговор?
- **`ru-closer-55`**
  - `prompt` before: Я никогда не засыпал(а) посреди вечернего разговора и утром первым делом не просил(а) досказать историю.
  - `prompt` after: Я никогда не просил(а) утром досказать историю, под которую заснул(а) накануне вечером.

## Residual human-playtest limitations

- No live couples playtest: cannot establish hit rate, laughter, comfort, or whether a pair recalls the same incident for distinct cards.
- Some school/work, garden, travel, craft and technology experiences remain intentionally optional; accessibility and cultural familiarity vary. No assumption that players own those things or have those experiences.
- Romantic prompts retain non-explicit kissing/hand-holding, nerves and affection; personal comfort varies. Follow-ups permit hypothetical discussion, not an obligation to reenact.
- Broad themes necessarily recur across 172 cards; no remaining incident-level duplicates identified editorially. Normalized uniqueness does not prove semantic uniqueness.
- Originals were reviewed as comparison material, never rewritten. The parent agent remains responsible for app integration and app-level checks.

## Main-agent final copy pass

Five additional RU prompt edits after the independent review: `ru-light-36`, `ru-light-48`, `ru-light-52`, `ru-stories-55` simplify compound-negative scope; `ru-stories-35` now describes finding an occupied seat rather than sitting on an already occupied seat. Original 72 cards per language preserved exactly.

## Main-agent integration verification

Merged 100 additions into each language deck: **172/language**, categories **58 light / 57 stories / 57 closer**. Compared original 72 objects, IDs and order against pre-expansion snapshots: unchanged. Default non-personal mix now 115/language. Continuous category IDs and full-deck unique prompts/follow-ups are covered by content tests.

- `NODE_ENV=test npm test`: **238 files / 3,483 tests passed**.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Production-preview browser harness: **8 cases / 32 scoped axe audits**, no accessibility violations/page errors; EN/RU phone/landscape, light/dark, reduced motion, full rounds, skip, keyboard, replay, exit/reload and unchanged persisted stats/history.
- Direct RU production-preview 20-card deal included 10 expansion cards, confirming new content is available in the actual game.
- User subsequently authorized commit and push of the implementation and expanded decks. No human fun/comfort playtest.
