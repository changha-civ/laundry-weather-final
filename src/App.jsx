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

  const getBaseDateTime = () => {
    const now = new Date();
    const target = new Date(now);
    target.setMinutes(target.getMinutes() - 45);

    return {
      base_date: `${target.getFullYear()}${String(
        target.getMonth() + 1
      ).padStart(2, "0")}${String(target.getDate()).padStart(2, "0")}`,
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

  const fetchWeather = async () => {
    if (!inputCity.trim()) return;

    setLoading(true);
    setError("");

    try {
      const place = await searchAddressByKakao(inputCity.trim());
      const { nx, ny } = convertToGrid(place.lat, place.lon);

      const { base_date, base_time } = getBaseDateTime();

      const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${decodeURIComponent(
        KMA_API_KEY
      )}&pageNo=1&numOfRows=100&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;

      const response = await fetch(url);
      const data = await response.json();

      const items = data?.response?.body?.items?.item;

      if (!items) {
        throw new Error("날씨 조회 실패");
      }

      const rainType = items.find(
        (item) => item.category === "PTY"
      )?.fcstValue;

      const result = {
        temp: items.find((item) => item.category === "T1H")?.fcstValue,
        humidity: items.find((item) => item.category === "REH")?.fcstValue,
        wind: items.find((item) => item.category === "WSD")?.fcstValue,
        rainType,
        rainText: getRainText(rainType),
      };

      const score = calculateScore(result);

      setSelectedCity(place.address);
      setWeather({
        ...result,
        score,
      });

      setHourlyList([
        { time: "현재", score },
        { time: "+1시간", score: Math.max(0, score - 5) },
        { time: "+2시간", score: Math.max(0, score - 8) },
      ]);

      setWeeklyList([]);
    } catch (err) {
      console.error(err);
      setError("날씨 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const getLaundryStatus = () => {
    if (!weather) return null;

    const score = weather.score;
    const smellRisk = 100 - score;
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
        message: "빨래가 빠르게 마를 가능성이 높습니다.",
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
        message: "평소보다 건조 시간이 오래 걸릴 수 있습니다.",
      };
    }

    return {
      level: "실내 건조 추천",
      emoji: rain ? "🌧️" : "💧",
      className: "bad",
      time: "실외 건조 비추천",
      score,
      smellRisk,
      action: "제습기 사용 추천",
      message: "습도가 높아 냄새 위험이 있습니다.",
    };
  };

  const laundryStatus = getLaundryStatus();
  const scene = getScene();

  return (
    <div className={`app ${scene}`}>
      <section className="hero">
        <div className="badge">자취생 맞춤 기상 서비스</div>

        <h1>LaundryCast</h1>

        <p className="brand-subtitle">
          자취생 빨래 건조 예측 서비스
        </p>

        <p className="subtitle">
          지역 기상 데이터를 분석해 빨래 건조 점수,
          냄새 위험도와 예상 건조 시간을 제공합니다.
        </p>

        <div className="search-box">
          <input
            value={inputCity}
            onChange={(e) => setInputCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchWeather();
            }}
            placeholder="지역 입력 예: 역북동, 강남역"
          />

          <button onClick={fetchWeather}>
            조회하기
          </button>
        </div>

        <p className="city-guide">
          전국 지역 검색 가능 · 기상청 API 활용
        </p>
      </section>

      {loading && (
        <p className="loading">
          ⏳ 날씨 정보를 불러오는 중...
        </p>
      )}

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {weather && laundryStatus && (
        <main className="dashboard">

          <section className={`summary-card ${laundryStatus.className}`}>

            <div className="summary-left">
              <div className="weather-icon">
                {laundryStatus.emoji}
              </div>

              <p className="location-name">
                {selectedCity}
              </p>

              <h2>
                {laundryStatus.level}
              </h2>

              <p className="summary-message">
                {laundryStatus.message}
              </p>
            </div>

            <div className="summary-right">

              <div className="score-circle">
                <strong>{laundryStatus.score}</strong>
                <span>/100</span>
              </div>

              <div className="score-info">
                <p className="mini-label">
                  오늘의 결론
                </p>

                <h3>
                  {laundryStatus.action}
                </h3>

                <div className="bar">
                  <div
                    style={{
                      width: `${laundryStatus.score}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="risk-card">
                <p>냄새 위험도</p>
                <strong>
                  {laundryStatus.smellRisk}%
                </strong>
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

        </main>
      )}

      <footer>
        본 서비스는 카카오 주소검색 API,
        기상청 단기예보 조회서비스를 활용하였습니다.
      </footer>
    </div>
  );
}

export default App;