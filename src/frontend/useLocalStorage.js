import { useEffect, useState } from "react";

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    const item = window.localStorage.getItem(key);
    return item !== null ? item : defaultValue;
  });

  useEffect(() => {
    try {
      if (value === undefined || value === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  }, [key, value]);

  return [value, setValue];
}

export default useLocalStorage;
