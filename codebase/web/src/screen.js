// Cùng ngưỡng với `@media (max-width: 760px)` trong theme.css: khi đó bảng thông tin nằm dưới bản đồ.
export const compact = () => window.matchMedia("(max-width: 760px)").matches;
