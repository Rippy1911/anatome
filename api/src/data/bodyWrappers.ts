// Body wrapper viewBox definitions, ported from HichamELBSI/react-native-body-highlighter
// (SvgMaleWrapper.tsx / SvgFemaleWrapper.tsx). viewBox values are exact.

export interface Wrapper {
  viewBox: string;
  outline: string;
}

export const WRAPPER: Record<"male" | "female", { front: Wrapper; back: Wrapper }> = {
  male: {
    front: { viewBox: "0 0 724 1448", outline: "" },
    back: { viewBox: "724 0 724 1448", outline: "" },
  },
  female: {
    front: { viewBox: "-50 -40 734 1538", outline: "" },
    back: { viewBox: "756 0 774 1448", outline: "" },
  },
};
