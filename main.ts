import { Plugin, TFile } from "obsidian";

interface FileStatus {
  name: string;
  count: number;
  checkTime: number;
  size: number;
}

interface Data {
  count: number;
  initCount: number;
  initTime: number;
  files: FileStatus[];
}

const DEFAULT_DATA: Data = {
  count: 0,
  initCount: 0,
  initTime: 0,
  files: [],
};

export default class WordCountPlugin extends Plugin {
  settings: Data;

  async onload() {
    await this.loadSettings();
    await this.processFiles();

    const processIfMarkdown = (file: TFile) => {
      if (file.extension === "md") {
        this.processFiles();
      }
    };

    this.registerEvent(this.app.vault.on("modify", processIfMarkdown));
    this.registerEvent(this.app.vault.on("delete", processIfMarkdown));
    this.registerEvent(this.app.vault.on("rename", processIfMarkdown));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_DATA, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async countChineseCharacters(file: TFile): Promise<number> {
    const content = await this.app.vault.read(file);
    let count = 0;

    for (const char of content) {
      const codePoint = char.codePointAt(0);
      if (codePoint && codePoint >= 0x4e00 && codePoint <= 0x9fa5) {
        count++;
      }
    }

    return count;
  }

  async processFiles() {
    const now = Date.now();
    const isSameDay = this.isSameDay(now, this.settings.initTime);

    if (!isSameDay) {
      this.settings.initTime = now;
    }

    const files = this.app.vault.getFiles();
    if (files.length === 0) return;

    const newFiles = await this.categorizeFiles(files, isSameDay);

    this.updateSettings(newFiles, isSameDay);
    await this.saveSettings();
  }

  async categorizeFiles(
    files: TFile[],
    isSameDay: boolean
  ): Promise<FileStatus[]> {
    const newFiles: FileStatus[] = [];

    for (const file of files) {
      if (isSameDay) {
        await this.handleSameDayFile(file, newFiles);
      } else {
        await this.handleNewDayFile(file, newFiles);
      }
    }

    return newFiles;
  }

  async handleSameDayFile(file: TFile, newFiles: FileStatus[]) {
    const existingFile = this.settings.files.find((f) => f.name === file.path);

    if (existingFile) {
      if (this.isFileModified(file, existingFile)) {
        newFiles.push(await this.createFileStatus(file));
      } else {
        newFiles.push(existingFile);
      }
    } else {
      newFiles.push(await this.createFileStatus(file));
    }
  }

  async handleNewDayFile(file: TFile, newUnchanged: FileStatus[]) {
    newUnchanged.push(await this.createFileStatus(file));
  }

  async createFileStatus(file: TFile): Promise<FileStatus> {
    const count = await this.countChineseCharacters(file);
    return {
      name: file.path,
      count,
      checkTime: Date.now(),
      size: file.stat.size,
    };
  }

  isFileModified(file: TFile, existingStatus: FileStatus): boolean {
    return (
      file.stat.mtime > existingStatus.checkTime ||
      file.stat.size !== existingStatus.size
    );
  }

  updateSettings(newFiles: FileStatus[], isSameDay: boolean) {
    this.settings.files = newFiles;
    this.settings.count = this.calculateTotalCount(newFiles);

    if (!isSameDay) {
      this.settings.initCount = this.settings.count;
    }
  }

  calculateTotalCount(files: FileStatus[]): number {
    return files.reduce((sum, file) => sum + file.count, 0);
  }

  isSameDay(date1: number, date2: number): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }
}
