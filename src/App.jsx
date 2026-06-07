import "./App.css";
import { useState } from "react";

function App() {
  const KMA_API_KEY = import.meta.env.VITE_KMA_API_KEY;
  const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY;
  const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

  const [inputCity, setInputCity] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [weather, setWeather] = useState(null);
  const [hourlyList, setHourlyList] = useState([]);
  const [weeklyList, setWeeklyList] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isNight = () => {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 6;
  };

  const getScene = () => {
    if (!weather) return isNight() ? "night" : "sunny";

    const rainType = String(weather.rainType);

    if (rainType === "3" || rainType === "7") return "snow";
    if (Number(rainType) > 0) return "rain";
    if (isNight()) return "night";
    if (Number(weather.humidity) >= 70) return "cloudy";

    return "sunny";
  };

  const getSceneLabel = () => {
    const scene = getScene();

    if (scene === "rain") return "비 오는 날";
    if (scene === "snow") return "눈 오는 날";
    if (scene === "night") return "밤 시간";
    if (scene === "cloudy") return "흐린 날";
    return "햇빛 쨍쨍";
  };

  const renderMotionSpans = () =>
    Array.from({ length: 12 }).map((_, index) => <span key={index}></span>);

  const getBaseDateTime = () => {
    const now = new Date();
    const target = new Date(now);
    target.setMinutes(target.getMinutes() - 45);

    return {
      base_date: `${target.getFullYear()}${String(target.getMonth() + 1).padStart(
        2,
        "0"
      )}${String(target.getDate()).padStart(2, "0")}`,
      base_time: `${String(target.getHours()).padStart(2, "0")}00`,
    };
  };

  const getRainText = (rainType) => {
    const code = String(rainType);

    if (code === "0") return "비 없음";
    if (code === "1") return "비";
    if (code === "2") return "비/눈";
    if (code === "3") return "눈";
    if (code === "5") return "빗방울";
    if (code === "6") return "빗방울/눈날림";
    if (code === "7") return "눈날림";

    return "정보 없음";
  };

  const convertToGrid = (lat, lon) => {
    const RE = 6371.00877;
    const GRID = 5.0;
    const SLAT1 = 30.0;
    const SLAT2 = 60.0;
    const OLON = 126.0;
    const OLAT = 38.0;
    const XO = 43;
    const YO = 136;
    const DEGRAD = Math.PI / 180.0;

    const re = RE / GRID;
    const slat1 = SLAT1 * DEGRAD;
    const slat2 = SLAT2 * DEGRAD;
    const olon = OLON * DEGRAD;
    const olat = OLAT * DEGRAD;

    let sn =
      Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
      Math.tan(Math.PI * 0.25 + slat1 * 0.5);

    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;

    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = (re * sf) / Math.pow(ro, sn);

    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = (re * sf) / Math.pow(ra, sn);

    let theta = lon * DEGRAD - olon;

    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;

    theta *= sn;

    return {
      nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
      ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
    };
  };

  const searchAddressByKakao = async (keyword) => {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(
      keyword
    )}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.documents || data.documents.length === 0) {
      throw new Error("주소 검색 결과 없음");
    }

    const place = data.documents[0];

    return {
      address: place.address_name || place.road_address_name || keyword,
      lat: Number(place.y),
      lon: Number(place.x),
    };
  };

  const calculateScore = ({ temp, humidity, wind, rainType }) => {
    let score = 50;

    if (Number(temp) >= 25) score += 20;
    else if (Number(temp) >= 18) score += 10;
    else score -= 5;

    if (Number(humidity) >= 80) score -= 35;
    else if (Number(humidity) >= 65) score -= 20;
    else score += 15;

    if (Number(wind) >= 3) score += 15;
    else if (Number(wind) >= 1.5) score += 8;

    if (Number(rainType) > 0) score -= 45;

    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const getScoreLabel = (score) => {
    if (score >= 75) return "강력 추천";
    if (score >= 60) return "추천";
    if (score >= 40) return "주의";
    return "비추천";
  };

  const makeHourlyForecast = (items) => {
    const times = [...new Set(items.map((item) => item.fcstTime))].slice(0, 6);

    return times.map((time) => {
      const temp = items.find(
        (item) => item.category === "T1H" && item.fcstTime === time
      )?.fcstValue;

      const humidity = items.find(
        (item) => item.category === "REH" && item.fcstTime === time
      )?.fcstValue;

      const wind = items.find(
        (item) => item.category === "WSD" && item.fcstTime === time
      )?.fcstValue;

      const rainType = items.find(
        (item) => item.category === "PTY" && item.fcstTime === time
      )?.fcstValue;

      const score = calculateScore({ temp, humidity, wind, rainType });

      return {
        time: `${time.slice(0, 2)}시`,
        score,
        label: getScoreLabel(score),
      };
    });
  };

  const fetchWeeklyForecast = async ({ lat, lon }) => {
    if (!OPENWEATHER_API_KEY) {
      setWeeklyList([]);
      return;
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.list) {
      throw new Error("주간 예보 조회 실패");
    }

    const dailyMap = {};

    data.list.forEach((item) => {
      const date = item.dt_txt.split(" ")[0];

      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          temps: [],
          humidity: [],
          wind: [],
          rain: false,
          scores: [],
        };
      }

      const temp = item.main.temp;
      const humidity = item.main.humidity;
      const wind = item.wind.speed;

      const rainType =
        item.weather[0].main === "Rain" || item.weather[0].main === "Snow"
          ? 1
          : 0;

      const score = calculateScore({
        temp,
        humidity,
        wind,
        rainType,
      });

      dailyMap[date].temps.push(temp);
      dailyMap[date].humidity.push(humidity);
      dailyMap[date].wind.push(wind);
      dailyMap[date].scores.push(score);

      if (
        item.weather[0].main === "Rain" ||
        item.weather[0].main === "Snow" ||
        item.pop >= 0.5
      ) {
        dailyMap[date].rain = true;
      }
    });

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const result = Object.values(dailyMap)
      .slice(0, 5)
      .map((day) => {
        const score = Math.round(avg(day.scores));

        return {
          date: day.date,
          temp: Math.round(avg(day.temps)),
          humidity: Math.round(avg(day.humidity)),
          wind: avg(day.wind).toFixed(1),
          rain: day.rain,
          score,
          label: getScoreLabel(score),
          reason: day.rain
            ? "비 예보로 실외 건조에 불리합니다."
            : score >= 60
            ? "비 예보가 없고 건조 조건이 비교적 좋습니다."
            : "습도 또는 기온 영향으로 건조 시간이 길 수 있습니다.",
        };
      });

    setWeeklyList(result);
  };

  const fetchWeatherByGrid = async ({ nx, ny, displayName }) => {
    const { base_date, base_time } = getBaseDateTime();

    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${decodeURIComponent(
      KMA_API_KEY
    )}&pageNo=1&numOfRows=100&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;

    const response = await fetch(url);
    const data = await response.json();

    const resultCode = data?.response?.header?.resultCode;
    const items = data?.response?.body?.items?.item;

    if (resultCode !== "00" || !items) {
      throw new Error("기상청 API 응답 오류");
    }

    const rainType = items.find((item) => item.category === "PTY")?.fcstValue;

    const result = {
      temp: items.find((item) => item.category === "T1H")?.fcstValue,
      humidity: items.find((item) => item.category === "REH")?.fcstValue,
      rainType,
      wind: items.find((item) => item.category === "WSD")?.fcstValue,
      rainText: getRainText(rainType),
      baseTime: base_time,
    };

    setSelectedCity(displayName);
    setWeather(result);
    setHourlyList(makeHourlyForecast(items));
  };

  const handleSearch = async () => {
    if (!inputCity.trim()) {
      setError("지역명이나 주소를 입력해주세요. 예: 역북동, 명지대 자연캠퍼스, 서울 강남역");
      setWeather(null);
      setWeeklyList([]);
      return;
    }

    setLoading(true);
    setError("");
    setWeather(null);
    setWeeklyList([]);

    try {
      const place = await searchAddressByKakao(inputCity.trim());
      const { nx, ny } = convertToGrid(place.lat, place.lon);

      await fetchWeatherByGrid({
        nx,
        ny,
        displayName: place.address,
      });

      await fetchWeeklyForecast({
        lat: place.lat,
        lon: place.lon,
      });
    } catch (error) {
      console.error(error);
      setError("주소 검색 또는 날씨 조회에 실패했습니다. 더 정확한 지역명으로 다시 입력해주세요.");
      setWeather(null);
      setWeeklyList([]);
    } finally {
      setLoading(false);
    }
  };

  const getLaundryStatus = () => {
    if (!weather) return null;

    const score = calculateScore(weather);
    const smellRisk = Math.max(0, Math.min(100, 100 - score));
    const rain = Number(weather.rainType) > 0;

    if (score >= 75) {
      return {
        level: "잘 마름",
        emoji: "☀️",
        className: "good",
        time: "약 3~4시간",
        score,
        smellRisk,
        action: "오늘은 실외 건조 추천",
        message: "기온과 습도 조건이 좋아 빨래가 빠르게 마를 가능성이 높습니다.",
        tip: "얇은 옷과 수건류 모두 건조하기 좋은 조건입니다.",
      };
    }

    if (score >= 50) {
      return {
        level: "느리게 마름",
        emoji: "🌥️",
        className: "normal",
        time: "약 5~7시간",
        score,
        smellRisk,
        action: "실내·실외 모두 가능",
        message: "건조는 가능하지만 평소보다 시간이 오래 걸릴 수 있습니다.",
        tip: "옷 사이 간격을 넓히고 선풍기 순환을 함께 사용하세요.",
      };
    }

    if (score >= 30) {
      return {
        level: "냄새 위험",
        emoji: rain ? "🌧️" : "💧",
        className: rain ? "rain" : "bad",
        time: "약 8시간 이상",
        score,
        smellRisk,
        action: "제습기 사용 추천",
        message: "습도가 높아 빨래 냄새가 발생할 가능성이 있습니다.",
        tip: "제습기 또는 에어컨 제습 모드를 함께 사용하는 것을 추천합니다.",
      };
    }

    return {
      level: "실내 건조 추천",
      emoji: rain ? "🌧️" : "💧",
      className: rain ? "rain" : "bad",
      time: "실외 건조 비추천",
      score,
      smellRisk,
      action: "실내 건조 권장",
      message: "비 또는 높은 습도로 인해 실외 건조에 적합하지 않습니다.",
      tip: "창문을 닫고 제습기, 선풍기, 에어컨 제습 모드를 함께 사용하세요.",
    };
  };

  const getReasons = () => {
    if (!weather) return [];

    const list = [];

    if (Number(weather.rainType) > 0) {
      list.push("강수 예보가 있어 실외 건조는 피하는 것이 좋습니다.");
    } else {
      list.push("현재 강수형태는 비 없음으로 확인됩니다.");
    }

    if (Number(weather.humidity) >= 75) {
      list.push(`습도 ${weather.humidity}%로 높아 냄새 위험이 증가합니다.`);
    } else {
      list.push(`습도 ${weather.humidity}%로 비교적 건조에 유리합니다.`);
    }

    if (Number(weather.wind) >= 2.5) {
      list.push(`풍속 ${weather.wind}m/s로 공기 순환에 도움이 됩니다.`);
    } else {
      list.push(`풍속 ${weather.wind}m/s로 약해 선풍기 보조가 좋습니다.`);
    }

    return list;
  };

  const getBestLaundryDay = () => {
    if (weeklyList.length === 0) return null;
    return [...weeklyList].sort((a, b) => b.score - a.score)[0];
  };

  const getCurrentTimeText = () => {
    const now = new Date();

    return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}.${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 기준`;
  };

  const laundryStatus = getLaundryStatus();
  const bestDay = getBestLaundryDay();
  const scene = getScene();

  return (
    <div className={`app ${scene} ${laundryStatus ? laundryStatus.className : ""}`}>
      <div className={`side-motion left ${scene}`}>
        <div className="scene-label">{getSceneLabel()}</div>
        {renderMotionSpans()}
      </div>

      <div className={`side-motion right ${scene}`}>
        <div className="scene-label">{getSceneLabel()}</div>
        {renderMotionSpans()}
      </div>

      <section className="hero">
        <div className="badge">자취생 맞춤 기상 서비스</div>
        <h1>LaundryCast</h1>
        <p className="brand-subtitle">자취생 맞춤 빨래 건조 예측 서비스</p>
        <p className="subtitle">
          지역 기상 데이터를 분석해 빨래 건조 점수, 냄새 위험도, 예상 건조 시간,
          주간 빨래 추천일과 행동 가이드를 제공하는 생활 밀착형 웹서비스입니다.
        </p>

        <div className="search-box">
          <input
            value={inputCity}
            onChange={(e) => setInputCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="지역/주소 입력 예: 역북동, 명지대 자연캠퍼스, 서울 강남역"
          />
          <button onClick={handleSearch}>조회하기</button>
        </div>

        <p className="city-guide">전국 지역 검색 가능 · 기상청 API + OpenWeather 5일 예보 활용</p>
      </section>

      {loading && <p className="loading">⏳ 주소와 기상 데이터를 분석 중입니다...</p>}
      {error && <div className="error-box">{error}</div>}

      {weather && laundryStatus && (
        <main className="dashboard">
          <section className={`summary-card ${laundryStatus.className}`}>
            <div className="summary-left">
              <div className="weather-icon">{laundryStatus.emoji}</div>
              <p className="location-name">{selectedCity}</p>
              <h2>{laundryStatus.level}</h2>
              <p className="summary-message">{laundryStatus.message}</p>
              <span>{getCurrentTimeText()}</span>
            </div>

            <div className="summary-right">
              <div className="score-circle">
                <strong>{laundryStatus.score}</strong>
                <span>/100</span>
              </div>

              <div className="score-info">
                <p className="mini-label">오늘의 결론</p>
                <h3>{laundryStatus.action}</h3>
                <p>점수가 높을수록 빨래가 빠르게 마르고 냄새 위험이 낮습니다.</p>
                <div className="bar">
                  <div style={{ width: `${laundryStatus.score}%` }}></div>
                </div>
              </div>

              <div className="risk-card">
                <p>냄새 위험도</p>
                <strong>{laundryStatus.smellRisk}%</strong>
              </div>
            </div>
          </section>

          <section className="weather-grid">
            <div className="info-card">
              <span>🌡️</span>
              <p>기온</p>
              <strong>{weather.temp}℃</strong>
            </div>
            <div className="info-card">
              <span>💧</span>
              <p>습도</p>
              <strong>{weather.humidity}%</strong>
            </div>
            <div className="info-card">
              <span>💨</span>
              <p>풍속</p>
              <strong>{weather.wind}m/s</strong>
            </div>
            <div className="info-card">
              <span>🌧️</span>
              <p>강수형태</p>
              <strong>{weather.rainText}</strong>
            </div>
          </section>

          <section className="decision-grid">
            <div className="estimate-card">
              <p className="mini-label">예상 건조 시간</p>
              <h2>{laundryStatus.time}</h2>
              <p>{laundryStatus.tip}</p>
            </div>

            <div className="reason-card">
              <p className="mini-label">추천 이유</p>
              <ul>
                {getReasons().map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="section-card">
            <div className="section-title">
              <h3>점수 산정 기준</h3>
              <p>기온, 습도, 풍속, 강수 여부를 반영해 빨래 건조 가능성을 계산합니다.</p>
            </div>
            <div className="standard-grid">
              <div>
                <strong>기온</strong>
                <p>높을수록 건조 속도 증가</p>
              </div>
              <div>
                <strong>습도</strong>
                <p>높을수록 냄새 위험 증가</p>
              </div>
              <div>
                <strong>풍속</strong>
                <p>공기 순환이 좋을수록 유리</p>
              </div>
              <div>
                <strong>강수</strong>
                <p>비·눈 예보 시 큰 감점</p>
              </div>
            </div>
          </section>

          {weeklyList.length > 0 && (
            <section className="section-card">
              <div className="section-title">
                <h3>이번 주 빨래 추천 캘린더</h3>
                <p>5일 예보를 바탕으로 비 예보와 건조 점수를 비교해 빨래하기 좋은 날을 추천합니다.</p>
              </div>

              {bestDay && (
                <div className="best-day-box">
                  <p>이번 주 가장 추천하는 빨래 날짜</p>
                  <strong>
                    {bestDay.date} · {bestDay.label} · {bestDay.score}점
                  </strong>
                </div>
              )}

              <div className="weekly-list">
                {weeklyList.map((day) => (
                  <div className={`weekly-card ${day.rain ? "rainy" : ""}`} key={day.date}>
                    <p>{day.date}</p>
                    <h4>{day.label}</h4>
                    <strong>{day.score}점</strong>
                    <span>{day.rain ? "비 예보 있음" : "비 예보 없음"}</span>
                    <small>
                      {day.temp}℃ · 습도 {day.humidity}% · 풍속 {day.wind}m/s
                    </small>
                    <em>{day.reason}</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section-card">
            <div className="section-title">
              <h3>시간대별 건조 추천</h3>
              <p>현재 예보 기준으로 가까운 시간대의 건조 가능성을 비교합니다.</p>
            </div>

            <div className="hourly-list">
              {hourlyList.map((item) => (
                <div className="hour-card" key={item.time}>
                  <p>{item.time}</p>
                  <strong>{item.score}점</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="section-card">
            <div className="section-title">
              <h3>자취생 행동 가이드</h3>
              <p>오늘 조건에 맞는 빨래 관리 방법을 추천합니다.</p>
            </div>

            <div className="guide-grid">
              <div>
                제습기 <strong>{laundryStatus.score < 60 ? "ON 추천" : "선택"}</strong>
              </div>
              <div>
                창문 <strong>{Number(weather.rainType) > 0 ? "닫기" : "환기 가능"}</strong>
              </div>
              <div>
                옷 간격 <strong>넓게 배치</strong>
              </div>
              <div>
                두꺼운 빨래 <strong>{laundryStatus.score >= 75 ? "가능" : "피하기"}</strong>
              </div>
            </div>
          </section>

          <section className="section-card">
            <div className="section-title">
              <h3>빨래 종류별 추천</h3>
              <p>건조 점수에 따라 자취생이 자주 말리는 빨래를 분류했습니다.</p>
            </div>

            <div className="clothes-list">
              <div>
                얇은 옷 <strong>{laundryStatus.score >= 40 ? "가능" : "비추천"}</strong>
              </div>
              <div>
                수건류 <strong>{laundryStatus.score >= 70 ? "가능" : "주의"}</strong>
              </div>
              <div>
                후드티 <strong>{laundryStatus.score >= 75 ? "가능" : "실내 추천"}</strong>
              </div>
              <div>
                이불 <strong>{laundryStatus.score >= 80 ? "가능" : "비추천"}</strong>
              </div>
            </div>
          </section>
        </main>
      )}

      <footer>
        본 서비스는 카카오 주소검색 API, 기상청 단기예보 조회서비스,
        OpenWeather 5일 예보 데이터를 활용하였습니다.
        <br />
        출처: Kakao Developers, 공공데이터포털(data.go.kr), 기상청, OpenWeather
      </footer>
    </div>
  );
}

export default App;