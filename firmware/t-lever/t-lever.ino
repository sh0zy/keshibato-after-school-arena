// 消しバト！ T字レバー コントローラー ファームウェア v2（回転センサー対応）
// -------------------------------------------------------------------
// スライドボリューム（引き量）と回転ボリューム（T字グリップの回転＝ハンドル）の位置を読んで、
// USB シリアルへ 100Hz で流すだけの役割。
// 「引いた量 → 強さ」「回転 → 狙う向き」の変換と「手を離した瞬間」の判定はブラウザ側
// （src/game/lever.ts）で行うため、しきい値を調整してもここを書き直す必要はない。
//
// 配線（ESP32 / ESP32-C3 どちらでも）
//   スライドボリューム 1番（端）  → GND
//   スライドボリューム 2番（中点） → SENSOR_PIN ＋ 0.1uF セラミックコンデンサで GND へ
//   スライドボリューム 3番（端）  → 3V3
//   ※ 5V は絶対につながないこと。ESP32 の ADC は 3.3V まで。
//   ※ 向きが逆（引くと値が下がる）でも、アプリのキャリブレーションで吸収される。
//
//   回転ボリューム 1番（端）  → GND           （ハンドル機能を使うときだけ）
//   回転ボリューム 2番（中点） → ANGLE_PIN ＋ 0.1uF セラミックコンデンサで GND へ
//   回転ボリューム 3番（端）  → 3V3
//   ※ 回転センサーを付けないときは ENABLE_ANGLE を 0 にする（浮いたピンの値を送らないため）。
//   ※ 右に回すと値が下がる配線でも、アプリの「まっすぐ／右いっぱい」の登録で吸収される。
//
// 送信するもの（1行＝1件、改行区切り）
//   "# ..."     起動時の自己紹介。アプリ側は読み飛ばす。
//   "V <値>"          ENABLE_ANGLE が 0 のとき。引き量の ADC の生の値（0〜4095）。
//   "V <値> A <値>"    ENABLE_ANGLE が 1 のとき。後ろの A が回転の ADC の生の値（0〜4095）。
// 受け取るもの
//   "?"         自己紹介をもう一度送る。
// -------------------------------------------------------------------

#if defined(CONFIG_IDF_TARGET_ESP32C3) || defined(CONFIG_IDF_TARGET_ESP32C6)
  // ESP32-C3 / C6：GPIO0〜4 が ADC1。ここでは GPIO3 を使う。
  static const int SENSOR_PIN = 3;
  static const int ANGLE_PIN  = 4;
#elif defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32S2)
  static const int SENSOR_PIN = 4;
  static const int ANGLE_PIN  = 5;
#else
  // 無印 ESP32：ADC2 は Wi-Fi と衝突するため、必ず ADC1（GPIO32〜39）を使う。
  static const int SENSOR_PIN = 34;
  static const int ANGLE_PIN  = 35;
#endif

// 1: T字グリップの回転（ハンドル）も読む。0: 引き量だけ（v1 と同じ出力）
#define ENABLE_ANGLE 1

static const uint32_t BAUD = 115200;
static const int      INTERVAL_US = 10000;  // 10ms ＝ 100Hz
static const int      OVERSAMPLE = 8;       // 1回の送信につき8回読んで平均し、ADC のばらつきを抑える
static const int      ADC_MAX = 4095;

static uint32_t nextSample = 0;

static void hello() {
  Serial.printf("# keshibato t-lever v2 pin=%d angle=%d adc=%d rate=%dhz\n", SENSOR_PIN, ENABLE_ANGLE ? ANGLE_PIN : -1, ADC_MAX, 1000000 / INTERVAL_US);
}

// OVERSAMPLE 回読んで平均し、0〜ADC_MAX に収める。
static int readAveraged(int pin) {
  uint32_t total = 0;
  for (int i = 0; i < OVERSAMPLE; i++) {
    total += (uint32_t)analogRead(pin);
  }
  int value = (int)(total / OVERSAMPLE);
  if (value < 0) value = 0;
  if (value > ADC_MAX) value = ADC_MAX;
  return value;
}

void setup() {
  Serial.begin(BAUD);
  analogReadResolution(12);
  // 減衰を最大にして、0〜3.3V をそのまま 0〜4095 に対応させる。
  analogSetPinAttenuation(SENSOR_PIN, ADC_11db);
  pinMode(SENSOR_PIN, INPUT);
#if ENABLE_ANGLE
  analogSetPinAttenuation(ANGLE_PIN, ADC_11db);
  pinMode(ANGLE_PIN, INPUT);
#endif

  // USB CDC の個体（C3/S3 など）は、ホストが開くまで少し待つ。
  uint32_t deadline = millis() + 1200;
  while (!Serial && millis() < deadline) {
    delay(10);
  }
  hello();
  nextSample = micros();
}

void loop() {
  // 届いた命令を処理する。1文字だけの単純な約束にしてある。
  while (Serial.available() > 0) {
    int command = Serial.read();
    if (command == '?') {
      hello();
    }
  }

  // 一定の間隔で送る。micros() の桁あふれも引き算なら正しく回る。
  uint32_t now = micros();
  if ((int32_t)(now - nextSample) < 0) {
    return;
  }
  nextSample += INTERVAL_US;
  // 処理が遅れて間隔を何回もまたいだときは、間隔を数え直して追いつく。
  if ((int32_t)(micros() - nextSample) > INTERVAL_US * 4) {
    nextSample = micros() + INTERVAL_US;
  }

  int value = readAveraged(SENSOR_PIN);
#if ENABLE_ANGLE
  Serial.printf("V %d A %d\n", value, readAveraged(ANGLE_PIN));
#else
  Serial.printf("V %d\n", value);
#endif
}
